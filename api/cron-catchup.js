'use strict';
// api/cron-catchup.js — Safety net for missed Monday runs.
// Runs Tuesday 10:00 UTC. Checks latest run_date in `findings`. If stale
// (> STALE_DAYS old), fires Phase 1 → Phase 2 → Phase 3 in sequence, so a
// missed Vercel dispatch doesn't leave the site a week behind.
//
// Idempotent: if the latest run is recent, this is a cheap no-op.
// Authorization: same bearer pattern as the other crons.

var SUPABASE_URL = process.env.SUPABASE_URL;
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
var CRON_SECRET  = process.env.CRON_SECRET || 'ynot-secret-2025';

// How many days stale before we self-heal. Weekly cadence = 7; we trigger at 5
// so a missed Monday run is caught by Tuesday's catchup before the week ends.
var STALE_DAYS = 5;

async function latestRunDate() {
  var url = SUPABASE_URL + '/rest/v1/findings?select=run_date&order=run_date.desc&limit=1';
  var res = await fetch(url, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  if (!res.ok) throw new Error('Supabase ' + res.status);
  var rows = await res.json();
  if (!rows || !rows.length) return null;
  return rows[0].run_date; // 'YYYY-MM-DD'
}

function daysBetween(isoDate, now) {
  var d = new Date(isoDate + 'T00:00:00Z').getTime();
  var diffMs = now.getTime() - d;
  return diffMs / (1000 * 60 * 60 * 24);
}

async function fireInternal(baseUrl, path) {
  var t0 = Date.now();
  var res = await fetch(baseUrl + path, {
    headers: { 'Authorization': 'Bearer ' + CRON_SECRET }
  });
  var body = null;
  try { body = await res.json(); } catch (_) { body = { parseError: true }; }
  return {
    path: path,
    status: res.status,
    ok: res.ok && body && body.success !== false,
    duration_ms: Date.now() - t0,
    body: body
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var auth = req.headers['authorization'] || '';
  var isExternal = auth.length > 0;
  if (isExternal && auth !== 'Bearer ' + CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  var protocol = req.headers['x-forwarded-proto'] || 'https';
  var host = req.headers['host'] || 'ynot-now.vercel.app';
  var baseUrl = protocol + '://' + host;

  var now = new Date();
  console.log('[cron-catchup] Checking staleness at', now.toISOString());

  try {
    var latest = await latestRunDate();
    if (!latest) {
      console.warn('[cron-catchup] No runs in findings — firing full pipeline');
    } else {
      var age = daysBetween(latest, now);
      console.log('[cron-catchup] Latest run_date=' + latest + ' (' + age.toFixed(2) + ' days old)');
      if (age < STALE_DAYS) {
        return res.status(200).json({
          success: true,
          action: 'noop',
          latest_run_date: latest,
          age_days: Number(age.toFixed(2)),
          threshold_days: STALE_DAYS,
          message: 'Pipeline is fresh — no catchup needed'
        });
      }
    }

    // Stale — run Phase 1, 2, 3 sequentially. If any phase fails, stop and
    // report; partial state is better than pretending everything succeeded.
    var results = [];
    var phases = ['/api/cron', '/api/cron-synthesise', '/api/cron-audio'];
    for (var i = 0; i < phases.length; i++) {
      console.log('[cron-catchup] Firing', phases[i]);
      var r = await fireInternal(baseUrl, phases[i]);
      results.push(r);
      if (!r.ok) {
        console.error('[cron-catchup] Phase failed:', phases[i], r.status);
        return res.status(200).json({
          success: false,
          action: 'catchup_partial',
          latest_run_date: latest,
          failed_at: phases[i],
          results: results
        });
      }
    }

    return res.status(200).json({
      success: true,
      action: 'catchup_fired',
      previous_run_date: latest,
      results: results.map(function (r) {
        return { path: r.path, status: r.status, duration_ms: r.duration_ms };
      })
    });

  } catch (err) {
    console.error('[cron-catchup] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// Must be long enough to run all three phases sequentially.
// Phase 1 ~40s + Phase 2 ~45s + Phase 3 ~60s = ~150s. Buffer to 300s.
module.exports.config = { maxDuration: 300 };
