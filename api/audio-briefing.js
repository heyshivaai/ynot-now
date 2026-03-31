// api/audio-briefing.js
// Generates a weekly AI audio briefing script from findings.
//
// GET /api/audio-briefing                 → latest week's briefing
// GET /api/audio-briefing?week=YYYY-MM-DD → specific week's briefing
// GET /api/audio-briefing?force=true      → bypass cache and regenerate
//
// Response: { success: true, briefing: { week, script: [{speaker, text}], summary, duration_estimate } }
//
// Script features:
// - Two AI hosts: "Signal" (optimist) and "Null" (skeptic)
// - Opening: Signal introduces the week
// - Body: Top 3-4 findings discussed back-and-forth
// - Closing: Null gives final skeptic take
// - Total: 3-5 minutes of dialogue (~600-900 words)
//
// Caches results in Supabase table `audio_briefings` (created via SQL if needed):
// CREATE TABLE audio_briefings (
//   id bigserial PRIMARY KEY,
//   week date NOT NULL UNIQUE,
//   script jsonb NOT NULL,
//   summary text,
//   duration_estimate text,
//   created_at timestamp DEFAULT now(),
//   updated_at timestamp DEFAULT now()
// );

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// Return the ISO Monday date string (YYYY-MM-DD) for any given date string
function toMonday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay(); // 0=Sun, 1=Mon ... 6=Sat
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

async function generateAudioBriefing(findings, runDate) {
  // Separate findings by verdict
  const signals = findings.filter(f => f.verdict === 'SIGNAL');
  const watches = findings.filter(f => f.verdict === 'WATCH');
  const unverified = findings.filter(f => f.verdict === 'UNVERIFIED');

  // Rank top 4 findings: prioritize SIGNAL, then WATCH, sorted by confidence
  const ranked = [
    ...signals.sort((a, b) => (b.confidence || 0) - (a.confidence || 0)),
    ...watches.sort((a, b) => (b.confidence || 0) - (a.confidence || 0)),
    ...unverified.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
  ].slice(0, 4);

  // Prepare context for Claude
  const topFindings = ranked.map((f, i) => {
    const trlLabel = { 9:'Proven',8:'Proven',7:'Standard',6:'Standard',5:'Pilot',4:'Pilot',3:'Experiment',2:'Experiment',1:'Idea' }[f.trl] || 'Watch';
    return `${i + 1}. [${f.verdict} · TRL ${f.trl}/${trlLabel}] "${f.title}" (${f.domain}/${f.subdomain || f.domain}, confidence: ${f.confidence}/5)\n   ${f.body || 'No description'}\n   Regions: ${(f.regions || []).join(', ') || 'Not specified'}`;
  }).join('\n\n');

  const stats = `${signals.length} Signal · ${watches.length} Watch · ${unverified.length} Unverified out of ${findings.length} total findings`;

  const prompt =
    `You are writing an audio briefing script for YNOT.NOW — a free, independent AI signal tracker for the insurance industry.\n\n` +
    `Two AI hosts will discuss this week's findings in a conversational, engaging dialogue:\n` +
    `- SIGNAL: An optimist who highlights the most important findings and their implications\n` +
    `- NULL: A skeptic who challenges hype, points out risks, and questions unverified claims\n\n` +
    `Week of ${runDate}. Summary: ${stats}\n\n` +
    `TOP 4 FINDINGS TO DISCUSS:\n${topFindings}\n\n` +
    `Write a dialogue script with this structure:\n\n` +
    `1. OPENING (Signal): 40-60 words. Signal welcomes listeners and sets up the week's theme with one compelling observation.\n\n` +
    `2. FINDING 1-4 DISCUSSIONS (alternating): Each finding gets 2-3 exchanges (80-120 words total per finding).\n   - Signal presents the finding, explains why it matters for insurance.\n   - Null responds with skepticism: Is this real? What's the catch? How proven is it?\n   - Signal (optional) counters with evidence or context.\n\n` +
    `3. CLOSING (Null): 40-60 words. Null gives a final skeptical take on what listeners should watch out for this week.\n\n` +
    `Rules:\n` +
    `- Natural, conversational tone. These are two intelligent people chatting, not robots.\n` +
    `- Reference specific finding titles, verdicts (SIGNAL/WATCH/UNVERIFIED), and confidence levels.\n` +
    `- Avoid jargon. Explain insurance concepts plainly.\n` +
    `- No markdown. Plain text only.\n` +
    `- Total script: 600-900 words (3-5 minute read at 150 words/minute).\n` +
    `- Output ONLY the script. No explanations or metadata.\n\n` +
    `Format each speaker's line exactly as:\n` +
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
      system: 'You write audio briefing scripts for YNOT.NOW, a free independent intelligence resource for anyone curious about AI in insurance. Your scripts feature two hosts: Signal (optimist) and Null (skeptic) discussing findings in natural, engaging dialogue. Be specific, grounded, and educational. Avoid hype and platitudes. Help listeners understand what findings mean and why they matter.',
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) throw new Error('Claude ' + res.status);
  const d = await res.json();
  const scriptText = d.content[0].text.trim();

  // Parse script into speaker/text pairs
  const lines = scriptText.split('\n').filter(l => l.trim());
  const script = [];
  for (const line of lines) {
    if (line.startsWith('SIGNAL:')) {
      script.push({ speaker: 'Signal', text: line.replace(/^SIGNAL:\s*/, '').trim() });
    } else if (line.startsWith('NULL:')) {
      script.push({ speaker: 'Null', text: line.replace(/^NULL:\s*/, '').trim() });
    }
  }

  // Estimate duration
  const wordCount = script.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
  const durationMinutes = Math.round((wordCount / 150) * 10) / 10;
  const durationEstimate = `${durationMinutes} minutes (approx ${wordCount} words)`;

  // Create summary
  const summary = `${signals.length} signals, ${watches.length} watch items, ${unverified.length} unverified from ${findings.length} total findings. Top 4 discussed.`;

  return { script, summary, durationEstimate, wordCount };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=7200, stale-while-revalidate=3600');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const weekParam = req.query.week; // Optional: YYYY-MM-DD format
  const force = req.query.force === 'true'; // bypass cache

  try {
    // Determine which week to fetch
    let targetWeek = null;
    let runId = null;

    if (weekParam) {
      targetWeek = toMonday(weekParam);
    } else {
      // Get the latest run
      const latestRun = await sbGet('findings?select=run_id,run_date&order=created_at.desc&limit=1');
      if (!latestRun || !latestRun.length) {
        return res.status(200).json({
          success: false,
          message: 'No findings available yet'
        });
      }
      targetWeek = toMonday(latestRun[0].run_date);
      runId = latestRun[0].run_id;
    }

    // Try cache first (unless force=true)
    if (!force) {
      try {
        const cached = await sbGet(`audio_briefings?week=eq.${encodeURIComponent(targetWeek)}`);
        if (cached && cached.length > 0) {
          return res.status(200).json({
            success: true,
            briefing: {
              week: cached[0].week,
              script: cached[0].script,
              summary: cached[0].summary,
              duration_estimate: cached[0].duration_estimate
            }
          });
        }
      } catch (e) {
        console.warn('[audio-briefing] Cache lookup failed:', e.message);
        // Fall through to generation
      }
    }

    // No cache hit, or cache disabled — fetch findings for this week
    if (!runId) {
      // Find the run for this week
      const runs = await sbGet(`findings?select=run_id,run_date&order=created_at.desc&limit=10`);
      if (!runs || !runs.length) {
        return res.status(200).json({
          success: false,
          message: 'No findings available'
        });
      }
      // Find the run that maps to our target week
      for (const run of runs) {
        if (toMonday(run.run_date) === targetWeek) {
          runId = run.run_id;
          break;
        }
      }
      if (!runId) {
        return res.status(404).json({
          success: false,
          message: `No findings found for week ${targetWeek}`
        });
      }
    }

    // Fetch all findings for this run
    const findings = await sbGet(`findings?run_id=eq.${encodeURIComponent(runId)}&order=verdict.asc,confidence.desc`);
    if (!findings || !findings.length) {
      return res.status(404).json({
        success: false,
        message: `No findings found for run ${runId}`
      });
    }

    // Generate briefing script
    const { script, summary, durationEstimate } = await generateAudioBriefing(findings, targetWeek);

    // Cache the result
    const briefingRow = {
      week: targetWeek,
      script: script,
      summary: summary,
      duration_estimate: durationEstimate
    };

    try {
      await sbPost('audio_briefings', [briefingRow]);
    } catch (e) {
      // Table may not exist yet, or duplicate key — try update
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
        duration_estimate: durationEstimate
      }
    });

  } catch (err) {
    console.error('[audio-briefing] Error:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};
