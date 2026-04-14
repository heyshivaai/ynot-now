// api/cron-audio.js — Phase 3: Generate weekly audio briefing
// Runs at 06:05 UTC every Monday, after Phase 1 (cron.js) and Phase 2 (cron-synthesise.js).
// Calls /api/audio-briefing?force=true internally to generate the ElevenLabs audio.
//
// This ensures the audio briefing is always generated as part of the weekly pipeline
// rather than relying on the first visitor to trigger it.

var CRON_SECRET = process.env.CRON_SECRET || 'ynot-secret-2025';
var pipelineRuns = require('../lib/utils/pipeline-runs');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var auth = req.headers['authorization'] || '';
  var isExternalCall = auth.length > 0;
  if (isExternalCall && auth !== 'Bearer ' + CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('[cron-audio] Phase 3: Generating audio briefing...');

  try {
    // Idempotency guard
    var weekKey = pipelineRuns.toMondayUTC(new Date());
    var force = String(req.query && req.query.force || '') === 'true';
    if (!force) {
      var already = await pipelineRuns.isPhaseDone(weekKey, 3);
      if (already) {
        console.log('[cron-audio] Phase 3 already completed for', weekKey, '— skipping');
        return res.status(200).json({
          success: true, phase: 3, skipped: true, week: weekKey,
          message: 'Phase 3 already completed for this week — skipping. Pass ?force=true to override.'
        });
      }
    }

    // Determine the base URL from the request
    var protocol = req.headers['x-forwarded-proto'] || 'https';
    var host = req.headers['host'] || 'ynot-now.vercel.app';
    var baseUrl = protocol + '://' + host;

    // Call the audio-briefing endpoint with force=true to generate fresh audio
    var response = await fetch(baseUrl + '/api/audio-briefing?force=true');
    var data = await response.json();

    if (data.success && data.briefing && data.briefing.has_audio) {
      console.log('[cron-audio] Audio briefing generated successfully');

      // Heartbeat
      try {
        await pipelineRuns.recordPhase(weekKey, 3, {
          phase3_at: new Date().toISOString(),
          phase3_has_audio: true,
          phase3_ok: true
        });
      } catch (e) { console.warn('[cron-audio] heartbeat write failed:', e.message); }

      return res.status(200).json({
        success: true,
        phase: 3,
        message: 'Audio briefing generated',
        week: data.briefing.week,
        has_audio: true,
        duration_estimate: data.briefing.duration_estimate
      });
    } else {
      var errorMsg = (data.briefing && data.briefing.audio_error) || data.message || 'Unknown error';
      console.warn('[cron-audio] Audio generation failed:', errorMsg);
      return res.status(200).json({
        success: false,
        phase: 3,
        message: 'Audio generation failed: ' + errorMsg,
        week: data.briefing && data.briefing.week
      });
    }
  } catch (err) {
    console.error('[cron-audio] Error:', err.message);
    return res.status(500).json({ success: false, phase: 3, error: err.message });
  }
};

// Vercel serverless config — audio generation can take up to 2 minutes
module.exports.config = { maxDuration: 120 };
