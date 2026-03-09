// api/pulse.js
// Returns executive weekly briefings ordered newest first.
// Deduplicates by ISO week so only one post per Monday-week is returned.
// If weekly_posts is empty, generates on-demand for the last two runs and caches them.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// Return the ISO Monday date string for any given date string (YYYY-MM-DD)
function toMonday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay(); // 0=Sun, 1=Mon ... 6=Sat
  const diff = (day === 0) ? -6 : 1 - day; // days to subtract to reach Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD of that Monday
}

async function sbGet(path) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
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

async function generateExecutiveBriefing(findings, runDate) {
  const signals = findings.filter(f => f.verdict === 'SIGNAL');
  const watches = findings.filter(f => f.verdict === 'WATCH');
  const noises  = findings.filter(f => f.verdict === 'NOISE');

  const lines = findings.map(f =>
    `[${f.verdict}] ${f.mind_name || f.mind_id} (${f.domain}): ${f.title} — ${(f.body || '').slice(0, 200)}`
  ).join('\n\n');

  const prompt =
    `You are the executive intelligence synthesis agent for YNOT.NOW — an independent technology signal platform for the insurance industry, tracking all emerging technology (AI, automation, data infrastructure, quantum, real-time decisioning, and more).\n\n` +
    `Week of ${runDate}. Eight specialist agents completed their scan. Total findings: ${findings.length} (${signals.length} Signals, ${watches.length} Watch, ${noises.length} Noise).\n\n` +
    `ALL FINDINGS:\n${lines}\n\n` +
    `Write a tight executive briefing — 120 to 150 words maximum:\n` +
    `- One sentence on the dominant theme this week\n` +
    `- Two or three sentences synthesising the most important developments across domains\n` +
    `- One sentence on the most significant implication for insurance leaders\n` +
    `- One forward-looking sentence on what to watch next\n\n` +
    `Tone: sharp, authoritative, board-level. Plain English. No bullets. No hashtags. No markdown. Return only the briefing text.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: 'You write concise executive intelligence briefings for insurance industry leaders. Plain prose, no formatting, no bullet points.',
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) throw new Error('Claude ' + res.status);
  const data = await res.json();
  return data.content[0].text.trim();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Return all cached posts, deduplicated to one per Monday-week, newest first
    try {
      const cached = await sbGet('weekly_posts?order=run_date.desc&status=eq.ready');
      if (cached && cached.length) {
        // Deduplicate: keep only the most recent post per Monday-week
        const seenWeeks = new Set();
        const deduped = [];
        for (const post of cached) {
          const week = toMonday(post.run_date);
          if (!seenWeeks.has(week)) {
            seenWeeks.add(week);
            deduped.push({ ...post, week_of: week });
          }
        }
        return res.status(200).json({ posts: deduped });
      }
    } catch (e) {
      console.warn('[pulse] weekly_posts not available, generating on-demand:', e.message);
    }

    // No cached posts — find the last two distinct runs in findings
    const allRunRows = await sbGet('findings?select=run_id,run_date&order=run_date.desc');
    if (!allRunRows || !allRunRows.length) {
      return res.status(200).json({ posts: [] });
    }

    // Deduplicate to get up to 2 distinct runs
    const seen = new Set();
    const runs = [];
    for (const row of allRunRows) {
      if (!seen.has(row.run_id)) {
        seen.add(row.run_id);
        runs.push(row);
        if (runs.length === 2) break;
      }
    }

    // Generate briefings for each run (sequentially to avoid rate limits)
    const generated = [];
    for (const run of runs) {
      const findings = await sbGet(`findings?run_id=eq.${encodeURIComponent(run.run_id)}&order=verdict.asc,confidence.desc`);
      if (!findings || !findings.length) continue;
      const postText = await generateExecutiveBriefing(findings, run.run_date);
      generated.push({ run_id: run.run_id, run_date: run.run_date, post_text: postText, status: 'ready' });
    }

    if (!generated.length) {
      return res.status(200).json({ posts: [] });
    }

    // Cache all generated posts
    try {
      await sbPost('weekly_posts', generated);
    } catch (e) {
      console.warn('[pulse] Could not cache to weekly_posts:', e.message);
    }

    // Add week_of field before returning
    const withWeek = generated.map(p => ({ ...p, week_of: toMonday(p.run_date) }));
    return res.status(200).json({ posts: withWeek });

  } catch (err) {
    console.error('[pulse] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
