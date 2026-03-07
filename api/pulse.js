// api/pulse.js
// Returns the latest executive weekly briefings.
// If weekly_posts is empty, generates on-demand from the latest findings run.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

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
    `Write a concise executive-level weekly briefing:\n` +
    `- Open with 1-2 sentences naming the dominant theme or most important shift this week\n` +
    `- Synthesise what happened across domains as a coherent narrative — not finding-by-finding\n` +
    `- Highlight the development with the greatest near-term implication for insurance leaders\n` +
    `- Surface any meaningful pattern: convergence across signals, contradictions, acceleration or stalling\n` +
    `- Close with one forward-looking sentence on what to watch next\n\n` +
    `Tone: sharp, authoritative — like a trusted analyst briefing a board. Plain English. No bullet points. No hashtags. No markdown. 3–4 short paragraphs. Return only the briefing text.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 700,
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
    // Return cached posts if they exist
    const posts = await sbGet('weekly_posts?order=run_date.desc&limit=2&status=eq.ready');
    if (posts && posts.length) {
      return res.status(200).json({ posts });
    }

    // No cached posts — generate on-demand from the latest findings run
    const latestRow = await sbGet('findings?select=run_id,run_date&order=created_at.desc&limit=1');
    if (!latestRow || !latestRow.length) {
      return res.status(200).json({ posts: [] });
    }

    const { run_id, run_date } = latestRow[0];
    const findings = await sbGet(`findings?run_id=eq.${encodeURIComponent(run_id)}&order=verdict.asc,confidence.desc`);
    if (!findings || !findings.length) {
      return res.status(200).json({ posts: [] });
    }

    const postText = await generateExecutiveBriefing(findings, run_date);

    // Cache it so subsequent visitors don't trigger another generation
    try {
      await sbPost('weekly_posts', [{ run_id, run_date, post_text: postText, status: 'ready' }]);
    } catch (e) {
      // weekly_posts table may not exist yet — proceed without caching
      console.warn('[pulse] Could not cache to weekly_posts:', e.message);
    }

    return res.status(200).json({ posts: [{ run_id, run_date, post_text: postText }] });

  } catch (err) {
    console.error('[pulse] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
