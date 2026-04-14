'use strict';
// api/cron.js — Phase 1: Primary agents (Scout, Vita, Lex, Terra, Horizon)
// Runs at 06:00 UTC every Monday via Vercel Cron.
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

var MINDS = definitions.PRIMARY_MINDS;
var log = logger.createLogger('phase1');

// ── QUERY GENERATION (with memory context) ──────────────────────────────────
async function generateQueries(mind, memory) {
  var memorySection = memory
    ? '\n\nYour findings from the last 4 weeks (do not repeat these — find what is NEW this week):\n' + memory
    : '\n\nThis is your first run — no prior memory.';
  var system = 'You are ' + mind.name + ', an autonomous AI research agent. ' + mind.brief +
    ' Generate exactly 4 specific, targeted web search queries to find the most relevant and RECENT developments in your domain this week. Return ONLY a JSON array of 4 strings, no other text.';
  var user = 'Generate your 4 search queries for this week. Focus on what is most likely to have changed or emerged in the last 7 days. Seed topics (make them more specific and current): ' +
    mind.querySeeds.join(', ') + memorySection;
  try {
    var raw = await anthropic.claudeCall(system, user, 300);
    var match = raw.match(/\[[\s\S]*?\]/);
    if (!match) throw new Error('no JSON array');
    var queries = JSON.parse(match[0]);
    if (!Array.isArray(queries) || queries.length === 0) throw new Error('empty');
    return queries.slice(0, 4).map(function(q) { return String(q); });
  } catch(e) {
    log.warn(mind.id, 'query_gen_fallback', { error: e.message });
    return mind.querySeeds.slice(0, 4);
  }
}

// ── ANALYSIS (with memory context, freshness metadata, signal_status) ───────
async function analyseResults(mind, queries, results, memory) {
  var resultsText = results.slice(0, 12).map(function(r, i) {
    var pub = r.published_date ? ' [published: ' + r.published_date + ']' : ' [NO DATE]';
    return '[' + (i + 1) + '] ' + r.title + pub + '\nURL: ' + r.url + '\n' + r.content;
  }).join('\n\n');
  var memorySection = memory
    ? '\n\nYour findings from the last 4 weeks (for context — do not repeat these, find what is NEW):\n' + memory
    : '';
  var system = prompts.buildPhase1AnalysisSystem(mind);
  var user = 'Your search queries this week:\n' + queries.map(function(q, i) { return (i + 1) + '. ' + q; }).join('\n') +
    '\n\nLive web results:\n\n' + resultsText + memorySection +
    '\n\nProduce your findings. Return only the JSON array.';
  try {
    var raw = await anthropic.claudeCall(system, user, 1800);
    var match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('no JSON array');
    var findings = JSON.parse(match[0]);
    if (!Array.isArray(findings)) throw new Error('not array');

    // Build URL-to-date lookup from original Tavily results
    var urlDateMap = {};
    results.forEach(function(r) {
      if (r.url && r.published_date) urlDateMap[r.url] = r.published_date;
    });

    // Verify refs and attach metadata
    var enriched = await Promise.all(findings.map(async function(f) {
      var refsWithDates = (f.refs || []).map(function(ref) {
        var enrichedRef = Object.assign({}, ref);
        if (ref.url && urlDateMap[ref.url]) enrichedRef.published_date = urlDateMap[ref.url];
        return enrichedRef;
      });
      var verifiedRefs = await urlUtils.verifyRefs(refsWithDates);
      return Object.assign({}, f, {
        mind_id: mind.id, mind_name: mind.name, mind_icon: mind.icon,
        refs: verifiedRefs, search_queries: queries,
        signal_status: f.signal_status || 'NEW'
      });
    }));
    return enriched;
  } catch(e) {
    log.error(mind.id, 'analysis_failed', { error: e.message });
    return [];
  }
}

// ── RUN SINGLE AGENT ────────────────────────────────────────────────────────
async function runAgent(mind, runId, runDate) {
  var agentStart = Date.now();
  log.info(mind.id, 'start', { domain: mind.domain });

  var memory = await signals.fetchAgentMemory(mind.id);
  log.info(mind.id, 'memory', { loaded: !!memory });

  var queries = await generateQueries(mind, memory);
  log.info(mind.id, 'queries', { count: queries.length, queries: queries });

  var results = await tavily.fetchAndDedupeResults(queries, 4);
  log.info(mind.id, 'tavily_results', { count: results.length });

  if (results.length === 0) {
    log.warn(mind.id, 'no_results', {});
    return { findings: [], metrics: { durationMs: Date.now() - agentStart, tavilyResults: 0, findings: 0 } };
  }

  await logger.softFail('raw_intel_' + mind.id, function() {
    return signals.storeRawIntelligence(mind.id, queries, results, runId, runDate);
  }, log);

  var findings = await analyseResults(mind, queries, results, memory);
  log.info(mind.id, 'findings', { count: findings.length });

  await logger.softFail('source_rep_' + mind.id, function() {
    return signals.recordSourceReputation(findings);
  }, log);

  return {
    findings: findings,
    metrics: { durationMs: Date.now() - agentStart, tavilyResults: results.length, findings: findings.length, queries: queries.length }
  };
}

// ── WEEKLY DIGEST ───────────────────────────────────────────────────────────
async function generateWeeklyDigest(findings, runDate) {
  var signalsList = findings.filter(function(f) { return f.verdict === 'SIGNAL'; });
  var watches  = findings.filter(function(f) { return f.verdict === 'WATCH'; });
  var unverified = findings.filter(function(f) { return f.verdict === 'UNVERIFIED' || f.verdict === 'NOISE'; });
  var top = signalsList.slice(0, 5).concat(watches.slice(0, 3));
  var findingsText = top.map(function(f) {
    return f.title + ' [' + f.verdict + ', TRL ' + (f.trl || '?') + ', ' + f.domain + ', ' + (f.signal_status || 'NEW') + ']: ' + String(f.body || '').substring(0, 200);
  }).join('\n');
  var prompt = 'Week of ' + runDate + '. Five autonomous agents independently searched the web this week using self-generated queries. ' +
    'Total findings: ' + findings.length + ' (' + signalsList.length + ' Signals, ' + watches.length + ' Watch, ' + unverified.length + ' Unverified).\n\n' +
    'Top findings:\n' + findingsText + '\n\n' +
    'Write an educational intelligence briefing for anyone curious about AI in insurance — practitioners, students, researchers, and leaders alike.\n\n' +
    'CRITICAL FORMAT RULES:\n' +
    '- Output PLAIN TEXT only. NO markdown formatting (no **, no *, no #, no [])\n' +
    '- Do NOT include section labels like [HOOK] or [CONTEXT] in the output\n' +
    '- Each bullet MUST start with -> followed by a space\n\n' +
    'Structure (follow exactly, no labels):\n\n' +
    'First line: One specific, concrete, slightly surprising sentence from a real finding. No cliches.\n\n' +
    'Second paragraph: 1-2 sentences on what the agents found. Mention "Eight autonomous agents" and finding counts naturally.\n\n' +
    '-> Finding title - One sharp sentence about what was found\n' +
    '-> Finding title - One sharp sentence\n' +
    '-> Finding title - One sharp sentence\n' +
    '-> Finding title - One sharp sentence\n' +
    '-> Finding title - One sharp sentence\n\n' +
    'Final line: One observational sentence on what is worth following. No "In conclusion". No "The future is...".\n\n' +
    'All findings this week -> ynot.now\n\n' +
    '#InsurTech #AIinInsurance #Insurance #Innovation\n\n' +
    'Banned words: leverage, landscape, transformative, game-changer, revolutionise, unlock, harness, delve, cutting-edge, unprecedented, seamless. Vary sentence length. Inform, do not advise.';
  return anthropic.claudeCall(
    'You write evidence-grounded intelligence briefings for anyone curious about AI in insurance — practitioners, students, and researchers. Your job is to inform and spark curiosity, not to advise or recommend. Sound like a well-read, curious observer. Use specific numbers and named technologies. Never use corporate filler.',
    prompt, 600
  );
}

async function saveWeeklyDigest(allFindings, runId, runDate) {
  log.info('-', 'digest_start', {});
  var postText = await generateWeeklyDigest(allFindings, runDate);
  await supabase.supabaseCall('DELETE', 'weekly_posts', null, '?run_date=eq.' + runDate).catch(function() {});
  await supabase.supabaseCall('POST', 'weekly_posts', [{ run_id: runId, run_date: runDate, post_text: postText, status: 'ready' }]);
  log.info('-', 'digest_saved', {});
  return postText;
}

// ── HANDLER ─────────────────────────────────────────────────────────────────
module.exports = logger.withErrorHandler('cron', async function handler(req, res) {
  var runStart = Date.now();
  var auth = req.headers['authorization'] || '';
  var isExternalCall = auth.length > 0;
  if (isExternalCall && auth !== 'Bearer ' + CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!TAVILY_KEY) { return res.status(500).json({ error: 'TAVILY_API_KEY not configured' }); }
  try { await supabase.supabaseCall('GET', 'findings', null, '?limit=1'); }
  catch(err) { return res.status(500).json({ error: 'Supabase connection failed', details: err.message }); }

  var runDate = new Date().toISOString().split('T')[0];
  var weekKey = pipelineRuns.toMondayUTC(runDate);

  // ── Idempotency guard ──────────────────────────────────────────────────────
  // Safe to call from multiple schedulers (Vercel Cron + GitHub Actions backup +
  // Tuesday catchup). If Phase 1 already completed for this week, return a
  // no-op success so dual-dispatch does not produce duplicate findings.
  var force = String(req.query && req.query.force || '') === 'true';
  if (!force) {
    var already = await pipelineRuns.isPhaseDone(weekKey, 1);
    if (already) {
      log.info('-', 'phase1_skip_idempotent', { week: weekKey });
      return res.status(200).json({
        success: true, phase: 1, skipped: true, week: weekKey,
        message: 'Phase 1 already completed for this week — skipping. Pass ?force=true to override.'
      });
    }
  }

  var runId = 'run_' + Date.now();
  var allFindings = []; var errors = []; var perAgent = {};

  log.info('-', 'phase1_start', { run_id: runId, run_date: runDate, agent_count: MINDS.length });
  var outcomes = await Promise.allSettled(MINDS.map(function(m) { return runAgent(m, runId, runDate); }));
  outcomes.forEach(function(o, i) {
    if (o.status === 'fulfilled') {
      allFindings = allFindings.concat(o.value.findings);
      perAgent[MINDS[i].id] = o.value.metrics;
    } else {
      errors.push({ mind: MINDS[i].id, error: o.reason && o.reason.message });
    }
  });

  if (allFindings.length === 0) {
    return res.status(500).json({ error: 'All agents failed', errors: errors });
  }

  // LAYER 3: Freshness validation
  var preValidationCount = allFindings.length;
  allFindings = freshness.validateSourceFreshness(allFindings, '[YNOT]');
  log.info('-', 'freshness_validation', { before: preValidationCount, after: allFindings.length });

  // Vendor-neutral filter
  var preVendorCount = allFindings.length;
  allFindings = vendorFilter.applyVendorFilter(allFindings, '[YNOT]');
  if (preVendorCount !== allFindings.length) {
    log.info('-', 'vendor_filter', { before: preVendorCount, after: allFindings.length });
  }

  // Primary-source enforcement — downgrade regulator claims lacking authority refs
  var primaryResult = primarySource.enforceBatch(allFindings);
  allFindings = primaryResult.findings;
  if (primaryResult.downgrades.length > 0) {
    log.warn('-', 'primary_source_downgrades', {
      count: primaryResult.downgrades.length,
      downgrades: primaryResult.downgrades
    });
  }

  // Build rows and store
  var rows = allFindings.map(function(f) { return normalizers.buildFindingRow(f, runId, runDate); });
  try {
    await supabase.supabaseCall('POST', 'findings', rows);
    log.info('-', 'findings_stored', { count: allFindings.length, run_id: runId });
  } catch(err) {
    return res.status(500).json({ error: 'Storage failed', details: err.message });
  }

  // Non-blocking post-processing
  await logger.softFail('signal_trajectories', function() {
    return signals.updateSignalTrajectories(allFindings, runDate);
  }, log);

  await logger.softFail('cross_agent_agreement', function() {
    return signals.detectCrossAgentAgreement(allFindings, runDate);
  }, log);

  var digestStatus = 'skipped';
  try { await saveWeeklyDigest(allFindings, runId, runDate); digestStatus = 'ready'; }
  catch(dErr) { log.error('-', 'digest_failed', { error: dErr.message }); digestStatus = 'error: ' + dErr.message; }

  // ── Baseline Management: collect and store metrics ─────────────────────────
  var runDuration = Date.now() - runStart;
  var metrics = baseline.collectRunMetrics({
    runId: runId, runDate: runDate, phase: 1,
    findings: allFindings, errors: errors,
    durationMs: runDuration, perAgent: perAgent
  });

  var baselineWarnings = [];
  var agentBaselineWarnings = [];
  await logger.softFail('baseline_check', async function() {
    var baselineData = await baseline.fetchBaseline();
    baselineWarnings = baseline.checkBaseline(metrics, baselineData);
    if (baselineWarnings.length > 0) {
      log.warn('-', 'baseline_deviation', { warnings: baselineWarnings });
    }
    await baseline.storeRunMetrics(metrics);
  }, log);

  // ── Per-agent metrics: track each mind individually ────────────────────────
  await logger.softFail('agent_metrics', async function() {
    var agentRows = agentMetrics.collectAllAgentMetrics(
      allFindings, perAgent, errors, runId, runDate, 1
    );
    await agentMetrics.storeAgentMetrics(agentRows);
    agentBaselineWarnings = await agentMetrics.checkAgentBaselines(agentRows);
    if (agentBaselineWarnings.length > 0) {
      log.warn('-', 'agent_baseline_deviation', { agents: agentBaselineWarnings });
    }
  }, log);

  // ── Heartbeat: record Phase 1 completion ───────────────────────────────────
  await logger.softFail('pipeline_runs_phase1', function() {
    return pipelineRuns.recordPhase(weekKey, 1, {
      phase1_run_id: runId,
      phase1_at: new Date().toISOString(),
      phase1_findings: allFindings.length,
      phase1_ok: true
    });
  }, log);

  return res.status(200).json({
    success: true, phase: 1, run_id: runId, run_date: runDate, week: weekKey,
    findings_count: allFindings.length, digest: digestStatus, errors: errors,
    trajectories_updated: true,
    metrics: { duration_ms: runDuration, fresh_rate: metrics.fresh_rate, avg_confidence: metrics.avg_confidence },
    baseline_warnings: baselineWarnings,
    agent_warnings: agentBaselineWarnings,
    note: 'Phase 2 synthesis (Null, Weave, Faro) runs at 06:02 UTC via cron-synthesise.js'
  });
});
