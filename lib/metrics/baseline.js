'use strict';
// lib/metrics/baseline.js — Pattern 4: Baseline Management
//
// Tracks agent performance metrics per run and stores baselines.
// Enables detection of degradation in agent output quality over time.

var supabase = require('../services/supabase');

/**
 * Collect metrics from a completed agent run.
 *
 * @param {object} params
 * @param {string} params.runId        - Run identifier
 * @param {string} params.runDate      - Run date (YYYY-MM-DD)
 * @param {number} params.phase        - Phase number (1 or 2)
 * @param {Array}  params.findings     - All findings from the run
 * @param {Array}  params.errors       - Agent errors [{mind, error}]
 * @param {number} params.durationMs   - Total run duration in ms
 * @param {object} params.perAgent     - Per-agent metrics {mindId: {findings, queries, tavilyResults, durationMs}}
 * @returns {object} - Collected metrics object
 */
function collectRunMetrics(params) {
  var findings = params.findings || [];
  var errors = params.errors || [];

  // Verdict distribution
  var verdictCounts = { SIGNAL: 0, WATCH: 0, UNVERIFIED: 0 };
  findings.forEach(function(f) {
    var v = String(f.verdict || '').toUpperCase();
    if (verdictCounts[v] !== undefined) verdictCounts[v]++;
  });

  // Freshness distribution
  var freshnessCounts = { fresh: 0, undated: 0, stale: 0 };
  findings.forEach(function(f) {
    var flag = f.freshness_flag || 'undated';
    if (freshnessCounts[flag] !== undefined) freshnessCounts[flag]++;
  });

  // Confidence distribution
  var confidenceSum = 0;
  var confidenceCount = 0;
  findings.forEach(function(f) {
    if (f.confidence) { confidenceSum += f.confidence; confidenceCount++; }
  });

  // Ref quality
  var totalRefs = 0;
  var findingsWithRefs = 0;
  findings.forEach(function(f) {
    var refCount = (f.refs || []).length;
    totalRefs += refCount;
    if (refCount > 0) findingsWithRefs++;
  });

  // Signal status distribution
  var signalStatusCounts = { NEW: 0, EMERGING: 0, CONFIRMED: 0, RECURRING: 0 };
  findings.forEach(function(f) {
    var s = f.signal_status || 'NEW';
    if (signalStatusCounts[s] !== undefined) signalStatusCounts[s]++;
  });

  return {
    run_id: params.runId,
    run_date: params.runDate,
    phase: params.phase,
    timestamp: new Date().toISOString(),

    // Volume metrics
    total_findings: findings.length,
    total_errors: errors.length,
    agent_success_rate: params.perAgent
      ? Object.keys(params.perAgent).length / (Object.keys(params.perAgent).length + errors.length)
      : (findings.length > 0 ? 1 : 0),

    // Quality metrics
    verdict_distribution: verdictCounts,
    avg_confidence: confidenceCount > 0 ? Math.round((confidenceSum / confidenceCount) * 100) / 100 : 0,
    freshness_distribution: freshnessCounts,
    fresh_rate: findings.length > 0 ? Math.round((freshnessCounts.fresh / findings.length) * 100) / 100 : 0,

    // Ref quality
    avg_refs_per_finding: findings.length > 0 ? Math.round((totalRefs / findings.length) * 100) / 100 : 0,
    findings_with_refs_rate: findings.length > 0 ? Math.round((findingsWithRefs / findings.length) * 100) / 100 : 0,

    // Signal tracking
    signal_status_distribution: signalStatusCounts,

    // Performance
    duration_ms: params.durationMs || 0,
    per_agent: params.perAgent || {},

    // Errors
    errors: errors.map(function(e) { return { mind: e.mind, error: e.error }; })
  };
}

/**
 * Store run metrics to Supabase (non-blocking).
 * Creates `run_metrics` table row if table exists.
 */
async function storeRunMetrics(metrics) {
  try {
    await supabase.supabaseCall('POST', 'run_metrics', [metrics]);
    console.log('[YNOT] Run metrics stored: ' + metrics.total_findings + ' findings, ' +
      metrics.fresh_rate * 100 + '% fresh, avg confidence ' + metrics.avg_confidence);
  } catch(e) {
    // Table may not exist yet — that's fine
    console.warn('[YNOT] run_metrics table not ready (non-blocking): ' + e.message);
  }
}

/**
 * Check if current metrics deviate significantly from baseline.
 * Returns an array of warnings.
 *
 * @param {object} current   - Current run metrics
 * @param {object} baseline  - Baseline metrics (historical average)
 * @returns {Array<string>}  - Warning messages
 */
function checkBaseline(current, baseline) {
  if (!baseline) return [];
  var warnings = [];

  // Alert if finding count drops by >40%
  if (baseline.total_findings > 0 && current.total_findings < baseline.total_findings * 0.6) {
    warnings.push('Finding count dropped to ' + current.total_findings + ' (baseline: ' + baseline.total_findings + ')');
  }

  // Alert if confidence drops by >20%
  if (baseline.avg_confidence > 0 && current.avg_confidence < baseline.avg_confidence * 0.8) {
    warnings.push('Avg confidence dropped to ' + current.avg_confidence + ' (baseline: ' + baseline.avg_confidence + ')');
  }

  // Alert if fresh rate drops by >30%
  if (baseline.fresh_rate > 0 && current.fresh_rate < baseline.fresh_rate * 0.7) {
    warnings.push('Fresh rate dropped to ' + (current.fresh_rate * 100).toFixed(0) + '% (baseline: ' + (baseline.fresh_rate * 100).toFixed(0) + '%)');
  }

  // Alert if error rate increases
  if (current.total_errors > 0 && baseline.total_errors === 0) {
    warnings.push(current.total_errors + ' agent errors (baseline: 0)');
  }

  return warnings;
}

/**
 * Fetch the most recent baseline (average of last 4 runs).
 */
async function fetchBaseline() {
  try {
    var rows = await supabase.supabaseCall('GET', 'run_metrics', null,
      '?order=timestamp.desc&limit=4');
    if (!rows || rows.length < 2) return null;

    var totalFindings = 0, totalConfidence = 0, totalFresh = 0, totalErrors = 0;
    rows.forEach(function(r) {
      totalFindings += r.total_findings || 0;
      totalConfidence += r.avg_confidence || 0;
      totalFresh += r.fresh_rate || 0;
      totalErrors += r.total_errors || 0;
    });
    var n = rows.length;
    return {
      total_findings: Math.round(totalFindings / n),
      avg_confidence: Math.round((totalConfidence / n) * 100) / 100,
      fresh_rate: Math.round((totalFresh / n) * 100) / 100,
      total_errors: Math.round(totalErrors / n)
    };
  } catch(e) {
    return null;
  }
}

module.exports = {
  collectRunMetrics: collectRunMetrics,
  storeRunMetrics: storeRunMetrics,
  checkBaseline: checkBaseline,
  fetchBaseline: fetchBaseline
};
