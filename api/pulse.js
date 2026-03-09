// api/pulse.js
// Returns executive weekly briefings with server-side pagination.
//
// GET /api/pulse                    → spotlight (latest week) + first archive page
// GET /api/pulse?section=spotlight  → latest week only (1 post)
// GET /api/pulse?section=archive&page=0&limit=5 → paginated archive (excludes latest week)
//
// All responses include { total, page, limit, posts[] } for archive,
// or { post } for spotlight.
//
// Deduplicates by ISO week so only one post per Monday-week is ever returned.
// If weekly_posts is empty, generates on-demand for the last two runs and caches them.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const ARCHIVE_DEFAULT_LIMIT = 5;
const ARCHIVE_MAX_LIMIT = 20;

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
      // Ask Supabase to return the total count in the Content-Range header
      'Prefer': 'count=exact'
    }
  });
  if (!res.ok) throw new Error('Supabase ' + res.status);
  const data = await res.json();
  // Parse total from Content-Range: 0-4/42
  const cr = res.headers.get('content-range') || '';
  const total = cr.includes('/') ? parseInt(cr.split('/')[1], 10) : null;
  return { data, total };
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
    `You are writing the weekly intelligence briefing for YNOT.NOW — a signal tracker for the insurance industry read by CTOs, Chief Innovation Officers, and senior strategy leaders.\n\n` +
    `Week of ${runDate}. Eight specialist agents scanned the market. ${findings.length} findings: ${signals.length} Signal, ${watches.length} Watch, ${noises.length} Noise.\n\n` +
    `ALL FINDINGS:\n${lines}\n\n` +
    `Write a 130–160 word briefing in plain prose. Four paragraphs, no bullets, no headers, no markdown.\n\n` +
    `Paragraph 1 — The week\'s sharpest observation. Start with a specific finding, not a generalisation. Name the technology, the domain, or the number. Make a judgment call — do not just describe.\n\n` +
    `Paragraph 2 — Two or three sentences connecting the most significant developments across different domains. Show the pattern, not just the list. Vary sentence length.\n\n` +
    `Paragraph 3 — One sentence on the most consequential implication for insurance leaders right now. Be specific about who should care and why.\n\n` +
    `Paragraph 4 — One forward-looking sentence. What should leaders be watching or doing before next Monday? No clichés.\n\n` +
    `Rules:\n` +
    `- Plain English. No jargon unless it is the precise term.\n` +
    `- Do not use: leverage, landscape, transformative, game-changer, revolutionise, unlock, ecosystem, synergy, paradigm, holistic, robust, seamless.\n` +
    `- Do not start with \'This week\' or \'AI is\' or \'The insurance industry\'.\n` +
    `- Vary sentence length. Short sentences land harder.\n` +
    `- Return only the briefing text.`;

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
      system: 'You write weekly intelligence briefings for senior insurance executives. Sharp, opinionated, specific. Plain prose only. No formatting, no bullets, no markdown. Vary sentence length. Make judgment calls, not just summaries.',
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) throw new Error('Claude ' + res.status);
  const d = await res.json();
  return d.content[0].text.trim();
}

// Deduplicate an array of posts to one per Monday-week (keep newest per week)
function dedupByWeek(posts) {
  const seenWeeks = new Set();
  const out = [];
  for (const post of posts) {
    const week = toMonday(post.run_date);
    if (!seenWeeks.has(week)) {
      seenWeeks.add(week);
      out.push({ ...post, week_of: week });
    }
  }
  return out;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const section = req.query.section || 'all'; // 'all' | 'spotlight' | 'archive'
  const page    = Math.max(0, parseInt(req.query.page  || '0', 10));
  const limit   = Math.min(ARCHIVE_MAX_LIMIT, Math.max(1, parseInt(req.query.limit || String(ARCHIVE_DEFAULT_LIMIT), 10)));

  try {
    // ── Try weekly_posts cache first ──────────────────────────────────────────
    let allPosts = null;
    try {
      // Fetch all posts ordered newest first — we need them all to deduplicate by week.
      // weekly_posts grows at 1 row/week so this is always a small table.
      const { data } = await sbGet('weekly_posts?order=run_date.desc&status=eq.ready');
      if (data && data.length) {
        allPosts = dedupByWeek(data); // one entry per Monday-week, newest first
      }
    } catch (e) {
      console.warn('[pulse] weekly_posts not available, generating on-demand:', e.message);
    }

    // ── Fall back: generate on-demand for last 2 runs ─────────────────────────
    if (!allPosts) {
      const { data: runRows } = await sbGet('findings?select=run_id,run_date&order=run_date.desc');
      if (!runRows || !runRows.length) {
        return res.status(200).json({ spotlight: null, archive: { posts: [], total: 0, page, limit } });
      }
      // Deduplicate run_ids, take up to 2
      const seenRuns = new Set();
      const runs = [];
      for (const row of runRows) {
        if (!seenRuns.has(row.run_id)) {
          seenRuns.add(row.run_id);
          runs.push(row);
          if (runs.length === 2) break;
        }
      }
      const generated = [];
      for (const run of runs) {
        const { data: findings } = await sbGet(`findings?run_id=eq.${encodeURIComponent(run.run_id)}&order=verdict.asc,confidence.desc`);
        if (!findings || !findings.length) continue;
        const postText = await generateExecutiveBriefing(findings, run.run_date);
        generated.push({ run_id: run.run_id, run_date: run.run_date, post_text: postText, status: 'ready' });
      }
      if (!generated.length) {
        return res.status(200).json({ spotlight: null, archive: { posts: [], total: 0, page, limit } });
      }
      try { await sbPost('weekly_posts', generated); } catch (e) { /* table may not exist yet */ }
      allPosts = dedupByWeek(generated);
    }

    // ── Build response ────────────────────────────────────────────────────────
    const spotlight = allPosts[0] || null;
    const archiveAll = allPosts.slice(1); // everything except the current week
    const archiveTotal = archiveAll.length;
    const archivePage = archiveAll.slice(page * limit, page * limit + limit);
    const totalPages = Math.ceil(archiveTotal / limit);

    if (section === 'spotlight') {
      return res.status(200).json({ spotlight });
    }

    if (section === 'archive') {
      return res.status(200).json({
        archive: {
          posts: archivePage,
          total: archiveTotal,
          total_pages: totalPages,
          page,
          limit
        }
      });
    }

    // Default 'all': spotlight + first archive page — used on initial page load
    return res.status(200).json({
      spotlight,
      archive: {
        posts: archivePage,
        total: archiveTotal,
        total_pages: totalPages,
        page,
        limit
      }
    });

  } catch (err) {
    console.error('[pulse] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
