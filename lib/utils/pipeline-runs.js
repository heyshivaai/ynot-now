'use strict';
// lib/utils/pipeline-runs.js
// Heartbeat + idempotency helpers for the weekly pipeline.
//
// Used by cron.js (phase 1), cron-synthesise.js (phase 2), cron-audio.js (phase 3),
// and api/health.js. Single source of truth: `pipeline_runs` table, keyed by the
// Monday (UTC) of the week being produced.

var supabase = require('../services/supabase');

// Return the ISO date string (YYYY-MM-DD) of the Monday of the week containing
// the given date. UTC-normalised so a Tuesday-afternoon catchup run still
// identifies as the Monday of the same week.
function toMondayUTC(date) {
  var d = date ? new Date(date) : new Date();
  var day = d.getUTCDay(); // 0=Sun … 6=Sat
  var diff = (day === 0) ? -6 : 1 - day;
  var m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  return m.toISOString().split('T')[0];
}

// Fetch the pipeline_runs row for a given week. Returns null if none exists.
async function getWeek(week) {
  try {
    var rows = await supabase.supabaseCall('GET', 'pipeline_runs', null,
      '?week=eq.' + encodeURIComponent(week) + '&select=*&limit=1');
    return (rows && rows.length) ? rows[0] : null;
  } catch (e) {
    // If the table doesn't exist yet (migration not applied), treat as "no row".
    // Callers must tolerate this so the pipeline keeps working pre-migration.
    return null;
  }
}

// Idempotency check: has this phase already completed successfully for this week?
async function isPhaseDone(week, phase) {
  var row = await getWeek(week);
  if (!row) return false;
  if (phase === 1) return !!row.phase1_ok;
  if (phase === 2) return !!row.phase2_ok;
  if (phase === 3) return !!row.phase3_ok;
  return false;
}

// Upsert a phase completion record. Safe to call multiple times — last write wins.
// We use PATCH-then-POST so the first phase of the week creates the row and
// subsequent phases update it.
async function recordPhase(week, phase, fields) {
  var patch = Object.assign({ updated_at: new Date().toISOString() }, fields);
  // Try update first
  try {
    await supabase.supabaseCall('PATCH', 'pipeline_runs', patch,
      '?week=eq.' + encodeURIComponent(week));
  } catch (_) { /* fall through to insert */ }

  // Always try an insert — if row exists the PATCH above updated it and this
  // insert will 409 which we swallow. If row didn't exist, PATCH was a no-op
  // and this insert creates it.
  try {
    var row = Object.assign({ week: week }, patch);
    await supabase.supabaseCall('POST', 'pipeline_runs', [row]);
  } catch (_) { /* row already existed — fine */ }
}

module.exports = {
  toMondayUTC: toMondayUTC,
  getWeek: getWeek,
  isPhaseDone: isPhaseDone,
  recordPhase: recordPhase
};
