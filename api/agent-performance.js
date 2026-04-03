'use strict';
// api/agent-performance.js — Per-mind performance API endpoint
//
// GET /api/agent-performance                     → latest run metrics for all 8 minds
// GET /api/agent-performance?mind=scout          → historical metrics for one mind
// GET /api/agent-performance?mind=scout&limit=12 → last N runs for one mind
// GET /api/agent-performance?compare=true        → all minds side-by-side from latest run

var supabase = require('../lib/services/supabase');
var logger   = require('../lib/errors/logger');

module.exports = logger.withErrorHandler('agent-performance', async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  var mindId = req.query.mind || null;
  var limit  = Math.min(52, Math.max(1, parseInt(req.query.limit || '8', 10)));
  var compare = req.query.compare === 'true';

  try {
    // ── Single mind history ─────────────────────────────────────────────────
    if (mindId) {
      var history = await supabase.supabaseCall('GET', 'agent_metrics', null,
        '?mind_id=eq.' + encodeURIComponent(mindId) +
        '&order=timestamp.desc&limit=' + limit
      );
      if (!history || history.length === 0) {
        return res.status(200).json({ mind_id: mindId, history: [], message: 'No metrics found for ' + mindId });
      }

      // Compute trend indicators
      var latest = history[0];
      var prev = history.length > 1 ? history[1] : null;
      var trends = {};
      if (prev) {
        trends.finding_count = trendLabel(latest.finding_count, prev.finding_count);
        trends.avg_confidence = trendLabel(latest.avg_confidence, prev.avg_confidence);
        trends.fresh_rate = trendLabel(latest.fresh_rate, prev.fresh_rate);
        trends.tavily_efficiency = trendLabel(latest.tavily_efficiency, prev.tavily_efficiency);
        trends.duration_ms = trendLabel(prev.duration_ms, latest.duration_ms); // lower is better
      }

      return res.status(200).json({
        mind_id: mindId,
        mind_name: latest.mind_name,
        latest: latest,
        trends: trends,
        history: history.map(summarizeRow)
      });
    }

    // ── Compare all minds (latest run) ──────────────────────────────────────
    // Get the most recent run_id
    var latestRow = await supabase.supabaseCall('GET', 'agent_metrics', null,
      '?order=timestamp.desc&limit=1&select=run_id,run_date'
    );
    if (!latestRow || latestRow.length === 0) {
      return res.status(200).json({ minds: [], message: 'No agent metrics yet' });
    }
    var runId = latestRow[0].run_id;
    var runDate = latestRow[0].run_date;

    var allMinds = await supabase.supabaseCall('GET', 'agent_metrics', null,
      '?run_id=eq.' + encodeURIComponent(runId) + '&order=mind_id.asc'
    );

    // Build leaderboard
    var leaderboard = (allMinds || []).map(function(m) {
      // Composite score: weighted quality metric
      var qualityScore = Math.round(
        (m.signal_count * 3 + m.watch_count * 1.5 + m.unverified_count * 0.5) +
        (m.avg_confidence * 5) +
        (m.fresh_rate * 20) +
        (m.avg_refs_per_finding * 3) -
        (m.status === 'error' ? 50 : 0)
      );
      return {
        mind_id: m.mind_id,
        mind_name: m.mind_name,
        phase: m.phase,
        status: m.status,
        finding_count: m.finding_count,
        signal_count: m.signal_count,
        avg_confidence: m.avg_confidence,
        fresh_rate: m.fresh_rate,
        tavily_efficiency: m.tavily_efficiency,
        avg_refs_per_finding: m.avg_refs_per_finding,
        duration_ms: m.duration_ms,
        quality_score: qualityScore
      };
    }).sort(function(a, b) { return b.quality_score - a.quality_score; });

    return res.status(200).json({
      run_id: runId,
      run_date: runDate,
      mind_count: leaderboard.length,
      leaderboard: leaderboard,
      minds: compare ? allMinds : undefined
    });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
});

function trendLabel(current, previous) {
  if (!previous || previous === 0) return 'new';
  var pct = ((current - previous) / previous) * 100;
  if (pct > 10) return 'up';
  if (pct < -10) return 'down';
  return 'stable';
}

function summarizeRow(row) {
  return {
    run_date: row.run_date,
    status: row.status,
    finding_count: row.finding_count,
    signal_count: row.signal_count,
    avg_confidence: row.avg_confidence,
    fresh_rate: row.fresh_rate,
    tavily_efficiency: row.tavily_efficiency,
    duration_ms: row.duration_ms
  };
}
