'use strict';
// api/cron-synthesise.js — Phase 2: Synthesis agents (Null, Weave, Faro)
// Runs at 06:02 UTC every Monday, 2 minutes after Phase 1 (cron.js).
// Refactored to use shared /lib/ modules (Atomic Decomposition pattern).

var CRON_SECRET = process.env.CRON_SECRET || 'ynot-secret-2025';
var TAVILY_KEY  = process.env.TAVILY_API_KEY || '';

// ── Shared modules ──────────────────────────────────────────────────────────
var supabase      = require('../lib/services/supabase');
var anthropic     = require('../lib/services/anthropic');
var tavily        = require('../lib/services/tavily');
var normalizers   = require('../lib/utils/normalizers');
var vendorFilter  = require('../lib/utils/vendor-filter');
var freshness     = require('../lib/utils/freshness');
var urlUtils      = require('../lib/utils/url-utils');
var definitions   = require('../lib/agents/definitions');
var signals       = require('../lib/agents/signals');
var prompts       = require('../lib/agents/prompts');
var logger        = require('../lib/errors/logger');
var baseline      = require('../lib/metrics/baseline');
var agentMetrics  = require('../lib/metrics/agent-metrics');
var pipelineRuns  = require('../lib/utils/pipeline-runs');
var primarySource = require('../lib/utils/primary-source');

var SYNTHESIS_MINDS = definitions.SYNTHESIS_MINDS;
var log = logger.createLogger('phase2');

// ── FETCH TODAY'S PHASE 1 FINDINGS ──────────────────────────────────────────
async function fetchTodaysFindings(runDate) {
  try {
    var data = await supabase.supabaseCall('GET', 'findings', null,
      '?run_date=eq.' + runDate + '&order=confidence.desc&limit=40');
    return data || [];
  } catch(e) {
    log.error('-', 'fetch_phase1_failed', { error: e.message });
    return [];
  }
}

// ── RUN SYNTHESIS AGENT ─────────────────────────────────────────────────────
async function runSynthesisAgent(mind, phase1Findings, runId, runDate) {
  var agentStart = Date.now();
  log.info(mind.id, 'start', { role: mind.role, extendedThinking: mind.extendedThinking });

  // Build summary of Phase 1 findings for context
  var findingsSummary = phase1Findings.slice(0, 20).map(function(f, i) {
    return (i+1) + '. [' + f.mind_name + ' / ' + f.verdict + ' / TRL' + (f.trl||'?') + '] ' +
      f.title + ': ' + String(f.body || '').substring(0, 150);
  }).join('\n');

  // Generate targeted search queries
  var querySystem = 'You are ' + mind.name + '. ' + mind.brief +
    ' Based on what the other agents found this week (provided below), generate 3 targeted web search queries to deepen your specific analysis. ' +
    'Return ONLY a JSON array of 3 strings.';
  var queryUser = 'Phase 1 findings from Scout, Vita, Lex, Terra, Horizon this week:\n' + findingsSummary +
    '\n\nGenerate 3 search queries for your ' + mind.role + ' analysis. Seed topics: ' + mind.querySeeds.join(', ');

  var queries = mind.querySeeds.slice(0, 3); // fallback
  try {
    var raw = await anthropic.claudeCall(querySystem, queryUser, 250);
    var match = raw.match(/\[[\s\S]*?\]/);
    if (match) {
      var parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.length > 0) queries = parsed.slice(0, 3).map(function(q) { return String(q); });
    }
  } catch(e) {
    log.warn(mind.id, 'query_gen_fallback', { error: e.message });
  }
  log.info(mind.id, 'queries', { count: queries.length, queries: queries });

  // Fetch Tavily results
  var deduped = await tavily.fetchAndDedupeResults(queries, 4);
  log.info(mind.id, 'tavily_results', { count: deduped.length });

  // Store raw intelligence
  await logger.softFail('raw_intel_' + mind.id, function() {
    return signals.storeRawIntelligence(mind.id, queries, deduped, runId, runDate);
  }, log);

  var resultsText = deduped.slice(0, 10).map(function(r, i) {
    var pub = r.published_date ? ' [published: ' + r.published_date + ']' : ' [NO DATE]';
    return '[' + (i+1) + '] ' + r.title + pub + '\nURL: ' + r.url + '\n' + r.content;
  }).join('\n\n');

  // Synthesis analysis
  var analysisSystem = prompts.buildPhase2AnalysisSystem(mind);
  var analysisUser = 'Phase 1 findings from other agents:\n' + findingsSummary +
    '\n\nYour additional web search results:\n\n' + (resultsText || '(no results)') +
    '\n\nProduce your synthesis findings. Return only the JSON array.';

  try {
    var callFn = mind.extendedThinking ? anthropic.claudeCallWithThinking : anthropic.claudeCall;
    var raw2 = await callFn(analysisSystem, analysisUser, 1400, 4000);
    var match2 = raw2.match(/\[[\s\S]*\]/);
    if (!match2) throw new Error('no JSON array');
    var findings = JSON.parse(match2[0]);
    if (!Array.isArray(findings)) throw new Error('not array');
    var enriched = await Promise.all(findings.map(async function(f) {
      var verifiedRefs = await urlUtils.verifyRefs(f.refs || []);
      return Object.assign({}, f, {
        mind_id: mind.id, mind_name: mind.name, mind_icon: mind.icon,
        refs: verifiedRefs, search_queries: queries,
        signal_status: f.signal_status || 'NEW'
      });
    }));
    log.info(mind.id, 'findings', { count: enriched.length, extendedThinking: mind.extendedThinking });
    return {
      findings: enriched,
      metrics: { durationMs: Date.now() - agentStart, tavilyResults: deduped.length, findings: enriched.length, queries: queries.length }
    };
  } catch(e) {
    log.error(mind.id, 'analysis_failed', { error: e.message });
    return { findings: [], metrics: { durationMs: Date.now() - agentStart, tavilyResults: deduped.length, findings: 0 } };
  }
}

// ── HANDLER ─────────────────────────────────────────────────────────────────
module.exports = logger.withErrorHandler('cron-synthesise', async function handler(req, res) {
  var runStart = Date.now();
  var auth = req.headers['authorization'] || '';
  var isExternalCall = auth.length > 0;
  if (isExternalCall && auth !== 'Bearer ' + CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!TAVILY_KEY) {
    return res.status(500).json({ error: 'TAVILY_API_KEY not configured' });
  }

  var runDate = new Date().toISOString().split('T')[0];
  var weekKey = pipelineRuns.toMondayUTC(runDate);

  // Idempotency guard — safe against dual-dispatch (Vercel + GitHub Actions + catchup)
  var force = String(req.query && req.query.force || '') === 'true';
  if (!force) {
    var already = await pipelineRuns.isPhaseDone(weekKey, 2);
    if (already) {
      log.info('-', 'phase2_skip_idempotent', { week: weekKey });
      return res.status(200).json({
        success: true, phase: 2, skipped: true, week: weekKey,
        message: 'Phase 2 already completed for this week — skipping. Pass ?force=true to override.'
      });
    }
  }

  log.info('-', 'phase2_start', { run_date: runDate });
  var phase1Findings = await fetchTodaysFindings(runDate);

  if (phase1Findings.length === 0) {
    return res.status(200).json({
      success: false, phase: 2,
      message: 'No Phase 1 findings found for ' + runDate + ' — Phase 2 skipped. Phase 1 may still be running.',
      run_date: runDate
    });
  }

  log.info('-', 'phase1_loaded', { count: phase1Findings.length });
  var runId = phase1Findings[0].run_id || ('run_synth_' + Date.now());
  var allSynthFindings = []; var errors = []; var perAgent = {};

  var outcomes = await Promise.allSettled(
    SYNTHESIS_MINDS.map(function(m) { return runSynthesisAgent(m, phase1Findings, runId, runDate); })
  );

  outcomes.forEach(function(o, i) {
    if (o.status === 'fulfilled') {
      allSynthFindings = allSynthFindings.concat(o.value.findings);
      perAgent[SYNTHESIS_MINDS[i].id] = o.value.metrics;
    } else {
      errors.push({ mind: SYNTHESIS_MINDS[i].id, error: o.reason && o.reason.message });
    }
  });

  if (allSynthFindings.length === 0) {
    return res.status(500).json({ error: 'All synthesis agents failed', errors: errors });
  }

  // Freshness validation
  var preValidationCount = allSynthFindings.length;
  allSynthFindings = freshness.validateSourceFreshness(allSynthFindings, '[YNOT-S]');
  log.info('-', 'freshness_validation', { before: preValidationCount, after: allSynthFindings.length });

  // Vendor-neutral filter
  var preVendorCount = allSynthFindings.length;
  allSynthFindings = vendorFilter.applyVendorFilter(allSynthFindings, '[YNOT-S]');
  if (preVendorCount !== allSynthFindings.length) {
    log.info('-', 'vendor_filter', { before: preVendorCount, after: allSynthFindings.length });
  }

  // Primary-source enforcement
  var primaryResult = primarySource.enforceBatch(allSynthFindings);
  allSynthFindings = primaryResult.findings;
  if (primaryResult.downgrades.length > 0) {
    log.warn('-', 'primary_source_downgrades', {
      count: primaryResult.downgrades.length,
      downgrades: primaryResult.downgrades
    });
  }

  // Build rows and store
  var rows = allSynthFindings.map(function(f) { return normalizers.buildFindingRow(f, runId, runDate); });
  try {
    await supabase.supabaseCall('POST', 'findings', rows);
    log.info('-', 'findings_stored', { count: allSynthFindings.length });
  } catch(err) {
    return res.status(500).json({ error: 'Storage failed', details: err.message });
  }

  // Non-blocking: update signal trajectories
  await logger.softFail('signal_trajectories', function() {
    return signals.updateSignalTrajectories(allSynthFindings, runDate);
  }, log);

  // ── Baseline Management ────────────────────────────────────────────────────
  var runDuration = Date.now() - runStart;
  var metrics = baseline.collectRunMetrics({
    runId: runId, runDate: runDate, phase: 2,
    findings: allSynthFindings, errors: errors,
    durationMs: runDuration, perAgent: perAgent
  });

  await logger.softFail('store_metrics', function() {
    return baseline.storeRunMetrics(metrics);
  }, log);

  // ── Per-agent metrics: track each synthesis mind individually ──────────────
  var agentBaselineWarnings = [];
  await logger.softFail('agent_metrics', async function() {
    var agentRows = agentMetrics.collectAllAgentMetrics(
      allSynthFindings, perAgent, errors, runId, runDate, 2
    );
    await agentMetrics.storeAgentMetrics(agentRows);
    agentBaselineWarnings = await agentMetrics.checkAgentBaselines(agentRows);
    if (agentBaselineWarnings.length > 0) {
      log.warn('-', 'agent_baseline_deviation', { agents: agentBaselineWarnings });
    }
  }, log);

  // Heartbeat — record Phase 2 completion
  await logger.softFail('pipeline_runs_phase2', function() {
    return pipelineRuns.recordPhase(weekKey, 2, {
      phase2_run_id: runId,
      phase2_at: new Date().toISOString(),
      phase2_findings: allSynthFindings.length,
      phase2_ok: true
    });
  }, log);

  return res.status(200).json({
    success: true, phase: 2, run_id: runId, run_date: runDate, week: weekKey,
    findings_count: allSynthFindings.length, errors: errors,
    phase1_context: phase1Findings.length + ' findings used',
    metrics: { duration_ms: runDuration, fresh_rate: metrics.fresh_rate, avg_confidence: metrics.avg_confidence },
    agent_warnings: agentBaselineWarnings,
    note: 'Synthesis complete. All findings stored.'
  });
});
