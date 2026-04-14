'use strict';
// api/health.js — pipeline health endpoint.
//
// Returns 200 if the latest week's pipeline is complete AND recent (< 8 days old).
// Returns 503 otherwise, with a machine-readable reason. Designed for UptimeRobot /
// BetterStack / any simple HTTP pinger.
//
// GET /api/health            → JSON summary + status code
// GET /api/health?debug=true → include raw pipeline_runs row for the latest week

var pipelineRuns = require('../lib/utils/pipeline-runs');
var supabase = require('../lib/services/supabase');

// How stale the latest run can be before we consider the pipeline unhealthy.
// Weekly cadence is 7 days; 8 gives the Monday run + Tuesday catchup a chance
// to land before flipping red.
var STALE_DAYS = 8;

function daysSince(iso, now) {
  if (!iso) return Infinity;
  return (now.getTime() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var now = new Date();
  var thisWeek = pipelineRuns.toMondayUTC(now);
  var debug = String(req.query && req.query.debug || '') === 'true';

  try {
    // Latest row in pipeline_runs (not necessarily thisWeek — could be last week
    // if we're checking on a Sunday before Monday's run).
    var rows = [];
    try {
      rows = await supabase.supabaseCall('GET', 'pipeline_runs', null,
        '?select=*&order=week.desc&limit=1');
    } catch (e) {
      return res.status(503).json({
        status: 'red',
        reason: 'pipeline_runs table unreachable',
        detail: e.message,
        checked_at: now.toISOString()
      });
    }

    if (!rows || rows.length === 0) {
      return res.status(503).json({
        status: 'red',
        reason: 'no pipeline_runs rows — table is empty',
        this_week: thisWeek,
        checked_at: now.toISOString()
      });
    }

    var latest = rows[0];
    var ageDays = daysSince(latest.updated_at || latest.phase1_at, now);
    var allPhasesOk = !!(latest.phase1_ok && latest.phase2_ok && latest.phase3_ok);

    var problems = [];
    if (!latest.phase1_ok) problems.push('phase1 not complete');
    if (!latest.phase2_ok) problems.push('phase2 not complete');
    if (!latest.phase3_ok) problems.push('phase3 not complete');
    if (ageDays > STALE_DAYS) problems.push('latest run is ' + ageDays.toFixed(1) + ' days old (threshold: ' + STALE_DAYS + ')');

    var healthy = allPhasesOk && ageDays <= STALE_DAYS;

    // yellow = phases complete but getting old; red = incomplete or very stale
    var status = healthy ? 'green' : (allPhasesOk && ageDays <= (STALE_DAYS + 2) ? 'yellow' : 'red');

    var payload = {
      status: status,
      healthy: healthy,
      latest_week: latest.week,
      this_week: thisWeek,
      age_days: Number(ageDays.toFixed(2)),
      stale_threshold_days: STALE_DAYS,
      phases: {
        phase1: { ok: !!latest.phase1_ok, findings: latest.phase1_findings, at: latest.phase1_at },
        phase2: { ok: !!latest.phase2_ok, findings: latest.phase2_findings, at: latest.phase2_at },
        phase3: { ok: !!latest.phase3_ok, has_audio: latest.phase3_has_audio, at: latest.phase3_at }
      },
      problems: problems,
      checked_at: now.toISOString()
    };

    if (debug) payload.raw = latest;

    return res.status(healthy ? 200 : 503).json(payload);

  } catch (err) {
    return res.status(500).json({
      status: 'red',
      reason: 'health check crashed',
      error: err.message,
      checked_at: now.toISOString()
    });
  }
};

module.exports.config = { maxDuration: 10 };
