'use strict';
// lib/metrics/agent-metrics.js — Per-agent (per-mind) performance tracking
//
// Tracks each of the 8 minds individually over time so you can spot:
// - Which agent is producing the highest-quality findings
// - Which agent's confidence or freshness is degrading
// - Whether an agent's Tavily search quality is declining
// - Per-agent error rates and duration trends

var supabase = require('../services/supabase');

/**
 * Collect metrics for a single agent from its findings.
 *
 * @param {object} params
 * @param {string} params.mindId       - Agent ID (e.g. 'scout', 'null')
 * @param {string} params.mindName     - Agent display name
 * @param {string} params.runId        - Run identifier
 * @param {string} params.runDate      - Run date (YYYY-MM-DD)
 * @param {number} params.phase        - Phase number (1 or 2)
 * @param {Array}  params.findings     - This agent's findings only
 * @param {number} params.durationMs   - Agent execution time in ms
 * @param {number} params.tavilyResults - Number of Tavily results received
 * @param {number} params.queryCount   - Number of search queries generated
 * @param {string|null} params.error   - Error message if agent failed
 * @returns {object} - Agent metrics row
 */
function collectAgentMetrics(params) {
  var findings = params.findings || [];

  // Verdict distribution
  var verdicts = { SIGNAL: 0, WATCH: 0, UNVERIFIED: 0 };
  findings.forEach(function(f) {
    var v = String(f.verdict || '').toUpperCase();
    if (verdicts[v] !== undefined) verdicts[v]++;
  });

  // Confidence
  var confSum = 0;
  findings.forEach(function(f) { confSum += (f.confidence || 0); });
  var avgConf = findings.length > 0 ? Math.round((confSum / findings.length) * 100) / 100 : 0;

  // Freshness
  var freshCount = 0;
  var undatedCount = 0;
  var staleCount = 0;
  findings.forEach(function(f) {
    var flag = f.freshness_flag || 'undated';
    if (flag === 'fresh') freshCount++;
    else if (flag === 'undated') undatedCount++;
    else staleCount++;
  });
  var freshRate = findings.length > 0 ? Math.round((freshCount / findings.length) * 100) / 100 : 0;

  // Ref quality
  var totalRefs = 0;
  findings.forEach(function(f) { totalRefs += (f.refs || []).length; });
  var avgRefs = findings.length > 0 ? Math.round((totalRefs / findings.length) * 100) / 100 : 0;

  // TRL distribution
  var trlSum = 0;
  findings.forEach(function(f) { trlSum += (f.trl || 5); });
  var avgTrl = findings.length > 0 ? Math.round((trlSum / findings.length) * 100) / 100 : 5;

  // Signal status
  var statuses = { NEW: 0, EMERGING: 0, CONFIRMED: 0, RECURRING: 0 };
  findings.forEach(function(f) {
    var s = f.signal_status || 'NEW';
    if (statuses[s] !== undefined) statuses[s]++;
  });

  // Domain coverage (how many unique domains/subdomains)
  var domains = {};
  findings.forEach(function(f) {
    var key = (f.domain || 'Unknown') + '/' + (f.subdomain || '-');
    domains[key] = (domains[key] || 0) + 1;
  });

  // Tavily efficiency: findings produced per Tavily result
  var tavilyEfficiency = params.tavilyResults > 0
    ? Math.round((findings.length / params.tavilyResults) * 100) / 100
    : 0;

  return {
    mind_id: params.mindId,
    mind_name: params.mindName,
    run_id: params.runId,
    run_date: params.runDate,
    phase: params.phase,
    timestamp: new Date().toISOString(),

    // Status
    status: params.error ? 'error' : (findings.length > 0 ? 'success' : 'empty'),
    error_message: params.error || null,

    // Volume
    finding_count: findings.length,
    query_count: params.queryCount || 0,
    tavily_result_count: params.tavilyResults || 0,
    tavily_efficiency: tavilyEfficiency,

    // Quality
    verdict_distribution: verdicts,
    signal_count: verdicts.SIGNAL,
    watch_count: verdicts.WATCH,
    unverified_count: verdicts.UNVERIFIED,
    avg_confidence: avgConf,
    avg_trl: avgTrl,

    // Freshness
    fresh_count: freshCount,
    undated_count: undatedCount,
    stale_count: staleCount,
    fresh_rate: freshRate,

    // Refs
    total_refs: totalRefs,
    avg_refs_per_finding: avgRefs,

    // Signal tracking
    signal_status_distribution: statuses,
    new_signals: statuses.NEW,
    emerging_signals: statuses.EMERGING,
    confirmed_signals: statuses.CONFIRMED,

    // Coverage
    domain_coverage: domains,
    unique_domains: Object.keys(domains).length,

    // Performance
    duration_ms: params.durationMs || 0
  };
}

/**
 * Collect metrics for ALL agents in a run from their combined findings.
 *
 * @param {Array}  allFindings - All findings with mind_id set
 * @param {object} perAgent    - Per-agent pipeline metrics { mindId: { durationMs, tavilyResults, findings, queries } }
 * @param {Array}  errors      - Agent errors [{ mind, error }]
 * @param {string} runId
 * @param {string} runDate
 * @param {number} phase
 * @returns {Array} - Array of agent metric rows
 */
function collectAllAgentMetrics(allFindings, perAgent, errors, runId, runDate, phase) {
  var byAgent = {};

  // Group findings by mind_id
  allFindings.forEach(function(f) {
    var id = f.mind_id;
    if (!byAgent[id]) byAgent[id] = [];
    byAgent[id].push(f);
  });

  var rows = [];

  // Metrics for agents that produced findings
  Object.keys(perAgent || {}).forEach(function(mindId) {
    var agentData = perAgent[mindId];
    var agentFindings = byAgent[mindId] || [];
    rows.push(collectAgentMetrics({
      mindId: mindId,
      mindName: agentFindings.length > 0 ? agentFindings[0].mind_name : mindId,
      runId: runId,
      runDate: runDate,
      phase: phase,
      findings: agentFindings,
      durationMs: agentData.durationMs,
      tavilyResults: agentData.tavilyResults,
      queryCount: agentData.queries || agentData.queryCount
    }));
  });

  // Metrics for agents that errored (no findings)
  errors.forEach(function(err) {
    if (!perAgent || !perAgent[err.mind]) {
      rows.push(collectAgentMetrics({
        mindId: err.mind,
        mindName: err.mind,
        runId: runId,
        runDate: runDate,
        phase: phase,
        findings: [],
        durationMs: 0,
        tavilyResults: 0,
        queryCount: 0,
        error: err.error
      }));
    }
  });

  return rows;
}

/**
 * Store agent metrics to Supabase (non-blocking).
 */
async function storeAgentMetrics(rows) {
  if (!rows || rows.length === 0) return;
  try {
    await supabase.supabaseCall('POST', 'agent_metrics', rows);
    console.log('[YNOT] Agent metrics stored for ' + rows.length + ' minds');
  } catch(e) {
    console.warn('[YNOT] agent_metrics table not ready (non-blocking): ' + e.message);
  }
}

/**
 * Fetch historical metrics for a specific agent (last N runs).
 *
 * @param {string} mindId - Agent ID
 * @param {number} limit  - Number of runs to fetch (default 8)
 * @returns {Promise<Array>} - Historical metrics rows, newest first
 */
async function fetchAgentHistory(mindId, limit) {
  try {
    return await supabase.supabaseCall('GET', 'agent_metrics', null,
      '?mind_id=eq.' + mindId + '&order=timestamp.desc&limit=' + (limit || 8));
  } catch(e) {
    return [];
  }
}

/**
 * Fetch the latest metrics for ALL agents (one row per mind from the most recent run).
 *
 * @returns {Promise<Array>} - Latest metrics per agent
 */
async function fetchLatestAgentMetrics() {
  try {
    // Get the most recent run_id
    var latest = await supabase.supabaseCall('GET', 'agent_metrics', null,
      '?order=timestamp.desc&limit=1&select=run_id');
    if (!latest || latest.length === 0) return [];
    var runId = latest[0].run_id;
    return await supabase.supabaseCall('GET', 'agent_metrics', null,
      '?run_id=eq.' + encodeURIComponent(runId) + '&order=mind_id.asc');
  } catch(e) {
    return [];
  }
}

/**
 * Check per-agent baselines. Compares current run against rolling average.
 * Returns warnings per agent.
 *
 * @param {Array} currentRows - This run's agent metrics
 * @returns {Promise<Array>}  - Array of { mind_id, warnings: [] }
 */
async function checkAgentBaselines(currentRows) {
  var results = [];

  for (var i = 0; i < currentRows.length; i++) {
    var current = currentRows[i];
    var history = await fetchAgentHistory(current.mind_id, 4);
    // Skip the current row if it's already in history
    history = history.filter(function(h) { return h.run_id !== current.run_id; });

    if (history.length < 2) continue; // Not enough history

    // Compute baseline from history
    var n = history.length;
    var baseFindings = 0, baseConf = 0, baseFresh = 0, baseTavily = 0;
    history.forEach(function(h) {
      baseFindings += h.finding_count || 0;
      baseConf += h.avg_confidence || 0;
      baseFresh += h.fresh_rate || 0;
      baseTavily += h.tavily_result_count || 0;
    });
    var baseline = {
      finding_count: Math.round(baseFindings / n),
      avg_confidence: Math.round((baseConf / n) * 100) / 100,
      fresh_rate: Math.round((baseFresh / n) * 100) / 100,
      tavily_result_count: Math.round(baseTavily / n)
    };

    var warnings = [];

    // Finding count drop
    if (baseline.finding_count > 0 && current.finding_count < baseline.finding_count * 0.5) {
      warnings.push(current.mind_id + ' produced ' + current.finding_count + ' findings (baseline: ' + baseline.finding_count + ')');
    }

    // Confidence drop
    if (baseline.avg_confidence > 0 && current.avg_confidence < baseline.avg_confidence * 0.75) {
      warnings.push(current.mind_id + ' avg confidence ' + current.avg_confidence + ' (baseline: ' + baseline.avg_confidence + ')');
    }

    // Freshness drop
    if (baseline.fresh_rate > 0 && current.fresh_rate < baseline.fresh_rate * 0.5) {
      warnings.push(current.mind_id + ' fresh rate ' + (current.fresh_rate * 100).toFixed(0) + '% (baseline: ' + (baseline.fresh_rate * 100).toFixed(0) + '%)');
    }

    // Tavily result drop (search quality)
    if (baseline.tavily_result_count > 0 && current.tavily_result_count < baseline.tavily_result_count * 0.4) {
      warnings.push(current.mind_id + ' Tavily results ' + current.tavily_result_count + ' (baseline: ' + baseline.tavily_result_count + ')');
    }

    // Agent errored
    if (current.status === 'error') {
      warnings.push(current.mind_id + ' FAILED: ' + (current.error_message || 'unknown error'));
    }

    if (warnings.length > 0) {
      results.push({ mind_id: current.mind_id, warnings: warnings });
    }
  }

  return results;
}

module.exports = {
  collectAgentMetrics: collectAgentMetrics,
  collectAllAgentMetrics: collectAllAgentMetrics,
  storeAgentMetrics: storeAgentMetrics,
  fetchAgentHistory: fetchAgentHistory,
  fetchLatestAgentMetrics: fetchLatestAgentMetrics,
  checkAgentBaselines: checkAgentBaselines
};
