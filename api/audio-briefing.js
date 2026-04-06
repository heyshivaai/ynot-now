// api/audio-briefing.js
// Generates a weekly AI audio briefing with ElevenLabs natural voices.
//
// GET /api/audio-briefing                 → latest week's briefing (script + audio_url)
// GET /api/audio-briefing?week=YYYY-MM-DD → specific week's briefing
// GET /api/audio-briefing?force=true      → bypass cache and regenerate
// GET /api/audio-briefing?audio=true&week=YYYY-MM-DD → serve raw MP3 audio
//
// Script features:
// - Two AI hosts: "Signal" (Rachel, optimist) and "Null" (Drew, skeptic)
// - Natural voices via ElevenLabs API
// - Audio cached in Supabase `audio_briefings` table (audio_data column, base64)
//
// Supabase table (add audio_data column if missing):
// ALTER TABLE audio_briefings ADD COLUMN IF NOT EXISTS audio_data text;
// ALTER TABLE audio_briefings ADD COLUMN IF NOT EXISTS audio_url text;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;

// ElevenLabs voice IDs — premade voices optimized for podcast dialogue
const VOICES = {
  Signal: 'XrExE9yKIg1WjnnlVkGX', // Matilda — warm, friendly, American female (podcast-optimized)
  Null:   'iP95p4xoKVk53GoZ742B'  // Chris — casual, natural, American male (conversational)
};

// ElevenLabs model — v3 for most expressive and natural output
const ELEVENLABS_MODEL = 'eleven_multilingual_v2';

function toMonday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  const diff = (day === 0) ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split('T')[0];
}

async function sbGet(path) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
    }
  });
  if (!res.ok) throw new Error('Supabase ' + res.status);
  return res.json();
}

async function sbPost(table, rows) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(rows)
  });
  if (!res.ok) throw new Error('Supabase save ' + res.status);
}

async function sbUpdate(table, whereClause, updates) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + whereClause, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(updates)
  });
  if (!res.ok) throw new Error('Supabase update ' + res.status);
}

// ── ElevenLabs TTS ──────────────────────────────────────────
async function synthesizeLine(text, voiceId) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_KEY,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg'
    },
    body: JSON.stringify({
      text: text,
      model_id: ELEVENLABS_MODEL,
      voice_settings: {
        stability: 0.35,         // Lower = more expressive/dynamic
        similarity_boost: 0.8,   // High = stays true to voice character
        style: 0.55,             // Higher = more stylistic/podcast-like
        use_speaker_boost: true
      }
    })
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown');
    throw new Error(`ElevenLabs ${res.status}: ${errText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function generateAudio(script) {
  // Synthesize each line and collect MP3 buffers
  const buffers = [];
  for (const line of script) {
    const voiceId = VOICES[line.speaker] || VOICES.Signal;
    const audioBuffer = await synthesizeLine(line.text, voiceId);
    buffers.push(audioBuffer);
    // Small silence between lines (ElevenLabs adds natural pauses, but we add a tiny gap)
    // MP3 frame of silence (~100ms) — a minimal valid MP3 frame
  }
  // Concatenate all MP3 buffers (MP3 is a streaming format, concatenation works)
  return Buffer.concat(buffers);
}

// ── Claude Script Generation ────────────────────────────────
async function generateAudioBriefing(findings, runDate) {
  const signals = findings.filter(f => f.verdict === 'SIGNAL');
  const watches = findings.filter(f => f.verdict === 'WATCH');
  const unverified = findings.filter(f => f.verdict === 'UNVERIFIED');

  const ranked = [
    ...signals.sort((a, b) => (b.confidence || 0) - (a.confidence || 0)),
    ...watches.sort((a, b) => (b.confidence || 0) - (a.confidence || 0)),
    ...unverified.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
  ].slice(0, 4);

  const topFindings = ranked.map((f, i) => {
    const trlLabel = { 9:'Proven',8:'Proven',7:'Standard',6:'Standard',5:'Pilot',4:'Pilot',3:'Experiment',2:'Experiment',1:'Idea' }[f.trl] || 'Watch';
    return `${i + 1}. [${f.verdict} · TRL ${f.trl}/${trlLabel}] "${f.title}" (${f.domain}/${f.subdomain || f.domain}, confidence: ${f.confidence}/5)\n   ${f.body || 'No description'}\n   Regions: ${(f.regions || []).join(', ') || 'Not specified'}`;
  }).join('\n\n');

  const stats = `${signals.length} Signal · ${watches.length} Watch · ${unverified.length} Unverified out of ${findings.length} total findings`;

  const prompt =
    `You are writing an audio briefing script for YNOT.NOW — a free, independent emerging technology signal tracker for the insurance industry. YNOT.NOW covers AI, automation, data analytics, IoT, blockchain, cybersecurity, and all emerging technologies reshaping insurance — not just AI.\n\n` +
    `Two AI hosts will discuss this week's findings in a conversational, engaging dialogue:\n` +
    `- SIGNAL: A warm, confident female host who highlights the most important findings and their implications\n` +
    `- NULL: A sharp, thoughtful male host who challenges hype, points out risks, and questions unverified claims\n\n` +
    `Week of ${runDate}. Summary: ${stats}\n\n` +
    `TOP 4 FINDINGS TO DISCUSS:\n${topFindings}\n\n` +
    `Write a dialogue script with this structure:\n\n` +
    `1. OPENING (Signal): 40-60 words. Signal welcomes listeners to YNOT.NOW Weekly and sets up the week's theme.\n\n` +
    `2. FINDING 1-4 DISCUSSIONS (alternating): Each finding gets 2-3 exchanges (80-120 words total per finding).\n   - Signal presents the finding, explains why it matters for insurance.\n   - Null responds with skepticism: Is this real? What's the catch? How proven is it?\n   - Signal (optional) counters with evidence or context.\n\n` +
    `3. CLOSING (Null): 40-60 words. Null gives a final skeptical take on what listeners should watch out for.\n\n` +
    `Rules:\n` +
    `- Natural, conversational tone. Like two smart podcast hosts chatting.\n` +
    `- Use contractions (we're, that's, isn't). Speak naturally.\n` +
    `- Reference specific finding titles, verdicts, and confidence levels.\n` +
    `- Avoid jargon. Explain insurance concepts plainly.\n` +
    `- No markdown. No asterisks. Plain spoken text only.\n` +
    `- Include brief pauses where natural: use "..." or short sentences.\n` +
    `- Total script: 500-800 words (3-5 minute listen).\n` +
    `- Output ONLY the script lines. No explanations or metadata.\n\n` +
    `Format each line exactly as:\n` +
    `SIGNAL: [text]\n` +
    `NULL: [text]\n\n` +
    `Begin now:`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: 'You write audio briefing scripts for YNOT.NOW, a free independent intelligence resource tracking emerging technologies transforming the insurance industry — including AI, automation, data analytics, IoT, blockchain, cybersecurity, and more. Your scripts feature two hosts: Signal (warm, optimistic female) and Null (sharp, skeptical male) discussing findings like a professional podcast. Be specific, grounded, and educational. Write for the ear, not the eye — use natural speech patterns, contractions, and conversational rhythm. Never say this is just about AI — it covers all emerging tech in insurance.',
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) throw new Error('Claude ' + res.status);
  const d = await res.json();
  const scriptText = d.content[0].text.trim();

  const lines = scriptText.split('\n').filter(l => l.trim());
  const script = [];
  for (const line of lines) {
    if (line.startsWith('SIGNAL:')) {
      script.push({ speaker: 'Signal', text: line.replace(/^SIGNAL:\s*/, '').trim() });
    } else if (line.startsWith('NULL:')) {
      script.push({ speaker: 'Null', text: line.replace(/^NULL:\s*/, '').trim() });
    }
  }

  const wordCount = script.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
  const durationMinutes = Math.round((wordCount / 150) * 10) / 10;
  const durationEstimate = `${durationMinutes} minutes (approx ${wordCount} words)`;
  const summary = `${signals.length} signals, ${watches.length} watch items, ${unverified.length} unverified from ${findings.length} total findings. Top 4 discussed.`;

  return { script, summary, durationEstimate, wordCount };
}

// ── Main Handler ────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const weekParam = req.query.week;
  const force = req.query.force === 'true';
  const serveAudio = req.query.audio === 'true';

  try {
    // Determine target week
    let targetWeek = null;
    let runId = null;

    if (weekParam) {
      targetWeek = toMonday(weekParam);
    } else {
      const latestRun = await sbGet('findings?select=run_id,run_date&order=created_at.desc&limit=1');
      if (!latestRun || !latestRun.length) {
        return res.status(200).json({ success: false, message: 'No findings available yet' });
      }
      targetWeek = toMonday(latestRun[0].run_date);
      runId = latestRun[0].run_id;
    }

    // ── Serve raw MP3 audio ──
    if (serveAudio) {
      try {
        const cached = await sbGet(`audio_briefings?week=eq.${encodeURIComponent(targetWeek)}&select=audio_data`);
        if (cached && cached.length > 0 && cached[0].audio_data) {
          const audioBuffer = Buffer.from(cached[0].audio_data, 'base64');
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('Content-Length', audioBuffer.length);
          res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=43200');
          return res.status(200).end(audioBuffer);
        }
      } catch (e) {
        console.warn('[audio-briefing] Audio fetch failed:', e.message);
      }
      return res.status(404).json({ success: false, message: 'Audio not yet generated for this week' });
    }

    // ── Try cache first ──
    if (!force) {
      try {
        const cached = await sbGet(`audio_briefings?week=eq.${encodeURIComponent(targetWeek)}&select=week,script,summary,duration_estimate,audio_data`);
        if (cached && cached.length > 0) {
          const hasAudio = !!cached[0].audio_data;
          return res.status(200).json({
            success: true,
            briefing: {
              week: cached[0].week,
              script: cached[0].script,
              summary: cached[0].summary,
              duration_estimate: cached[0].duration_estimate,
              has_audio: hasAudio,
              audio_url: hasAudio ? `/api/audio-briefing?audio=true&week=${encodeURIComponent(targetWeek)}` : null
            }
          });
        }
      } catch (e) {
        console.warn('[audio-briefing] Cache lookup failed:', e.message);
      }
    }

    // ── No cache — fetch findings ──
    if (!runId) {
      const runs = await sbGet('findings?select=run_id,run_date&order=created_at.desc&limit=10');
      if (!runs || !runs.length) {
        return res.status(200).json({ success: false, message: 'No findings available' });
      }
      for (const run of runs) {
        if (toMonday(run.run_date) === targetWeek) {
          runId = run.run_id;
          break;
        }
      }
      if (!runId) {
        return res.status(404).json({ success: false, message: `No findings found for week ${targetWeek}` });
      }
    }

    const findings = await sbGet(`findings?run_id=eq.${encodeURIComponent(runId)}&order=verdict.asc,confidence.desc`);
    if (!findings || !findings.length) {
      return res.status(404).json({ success: false, message: `No findings for run ${runId}` });
    }

    // ── Generate script via Claude ──
    const { script, summary, durationEstimate } = await generateAudioBriefing(findings, targetWeek);

    // ── Generate audio via ElevenLabs ──
    let audioBase64 = null;
    let audioUrl = null;
    let audioError = null;
    if (ELEVENLABS_KEY) {
      try {
        console.log('[audio-briefing] Generating ElevenLabs audio for', script.length, 'lines...');
        const audioBuffer = await generateAudio(script);
        audioBase64 = audioBuffer.toString('base64');
        audioUrl = `/api/audio-briefing?audio=true&week=${encodeURIComponent(targetWeek)}`;
        console.log('[audio-briefing] Audio generated:', Math.round(audioBuffer.length / 1024), 'KB');
      } catch (e) {
        audioError = e.message;
        console.warn('[audio-briefing] ElevenLabs generation failed:', e.message);
        // Continue without audio — script still works
      }
    } else {
      audioError = 'ELEVENLABS_API_KEY not configured';
      console.log('[audio-briefing] No ELEVENLABS_API_KEY — skipping audio generation');
    }

    // ── Cache result ──
    const briefingRow = {
      week: targetWeek,
      script: script,
      summary: summary,
      duration_estimate: durationEstimate,
      ...(audioBase64 ? { audio_data: audioBase64 } : {})
    };

    try {
      await sbPost('audio_briefings', [briefingRow]);
    } catch (e) {
      try {
        await sbUpdate('audio_briefings', `week=eq.${encodeURIComponent(targetWeek)}`, briefingRow);
      } catch (updateErr) {
        console.warn('[audio-briefing] Could not cache result:', e.message);
      }
    }

    return res.status(200).json({
      success: true,
      briefing: {
        week: targetWeek,
        script: script,
        summary: summary,
        duration_estimate: durationEstimate,
        has_audio: !!audioBase64,
        audio_url: audioUrl,
        ...(audioError ? { audio_error: audioError } : {})
      }
    });

  } catch (err) {
    console.error('[audio-briefing] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// Vercel serverless config — audio generation makes 15-20 sequential TTS calls
module.exports.config = { maxDuration: 120 };