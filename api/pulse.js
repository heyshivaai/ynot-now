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

async function generateExecutiveBriefing(findings, runDate, prevFindings) {
  const signals = findings.filter(f => f.verdict === 'SIGNAL');
  const watches = findings.filter(f => f.verdict === 'WATCH');
  const noises  = findings.filter(f => f.verdict === 'NOISE');

  // Agent summary line — goes in the card header, NOT the post body
  const agentSummary = `Eight agents · ${findings.length} findings — ${signals.length} Signals, ${watches.length} Watch, ${noises.length} Noise`;

  // LAYER 4: Pick the 3 most compelling findings for bullets: prioritize freshness, then high-confidence SIGNALs
  const ranked = [
    ...signals.sort((a, b) => {
      // Sort by freshness_priority first (1=fresh, 2=undated, 3=stale), then confidence
      const freshDiff = (a.freshness_priority || 2) - (b.freshness_priority || 2);
      return freshDiff !== 0 ? freshDiff : (b.confidence || 0) - (a.confidence || 0);
    }),
    ...watches.sort((a, b) => {
      const freshDiff = (a.freshness_priority || 2) - (b.freshness_priority || 2);
      return freshDiff !== 0 ? freshDiff : (b.confidence || 0) - (a.confidence || 0);
    }),
    ...noises.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
  ].slice(0, 5);

  const bulletData = ranked.map(f => {
    const trlLabel = { 9:'Proven',8:'Proven',7:'Standard',6:'Standard',5:'Pilot',4:'Pilot',3:'Experiment',2:'Experiment',1:'Idea' }[f.trl] || 'Watch';
    return `[${f.verdict} · ${trlLabel} · ${f.signal_status || 'NEW'}] ${f.title} (${f.domain}/${f.subdomain || f.domain}): ${(f.body || '').slice(0, 180)}`;
  }).join('\n\n');

  const allLines = findings.map(f =>
    `[${f.verdict}] ${f.mind_name || f.mind_id} (${f.domain}): ${f.title} — ${(f.body || '').slice(0, 150)}`
  ).join('\n');

  // What changed from last week
  let changedContext = '';
  if (prevFindings && prevFindings.length) {
    const prevTitles = prevFindings.map(f => f.title.toLowerCase());
    const newThisWeek = findings.filter(f => {
      const words = f.title.toLowerCase().split(/\s+/);
      return !prevTitles.some(pt => words.filter(w => w.length > 4 && pt.includes(w)).length >= 2);
    }).slice(0, 3).map(f => f.title);
    const recurring = findings.filter(f => f.signal_status === 'CONFIRMED' || f.signal_status === 'RECURRING').slice(0, 2).map(f => f.title);
    if (newThisWeek.length || recurring.length) {
      changedContext = `\n\nCHANGES FROM LAST WEEK:\n`;
      if (newThisWeek.length) changedContext += `New this week: ${newThisWeek.join(', ')}\n`;
      if (recurring.length) changedContext += `Recurring/confirmed signals: ${recurring.join(', ')}\n`;
    }
  }

  const prompt =
    `You are writing the weekly post for YNOT.NOW — a free, independent AI signal tracker for the insurance industry, read by insurance professionals, students, researchers, and anyone curious about how AI is developing in insurance.\n\n` +
    `SCOPE: Life insurance, annuities, retirement products, P&C insurance (personal lines, commercial lines, specialty), and horizontal/deep tech with insurance implications. DO NOT include health insurance, pharmacy benefits, or healthcare IT findings (e.g. Optum, Epic, hospital systems).\n\n` +
    `Week of ${runDate}. Eight specialist agents scanned the market and produced ${findings.length} findings: ${signals.length} Signal, ${watches.length} Watch, ${noises.length} Noise.\n\n` +
    `TOP FINDINGS FOR BULLETS:\n${bulletData}\n\n` +
    `ALL FINDINGS (for context only):\n${allLines}\n` +
    changedContext + `\n` +
    `Write a single post. Use EXACTLY this structure — no deviations:\n\n` +
    `LINE 1 (Hook): One sentence. Specific. Slightly surprising or thought-provoking. Must reference a real finding from the scope above. No generic openers. No health insurance examples. Make it feel like something a well-read, curious observer of AI in insurance would say.\n\n` +
    `BLANK LINE\n\n` +
    `BULLETS (exactly 3, each on its own line starting with →):\n` +
    `→ [Finding title, 6 words max] — [one sharp sentence: what was found and what it reveals about the state of AI in insurance. Max 22 words.]\n` +
    `→ [Finding title, 6 words max] — [one sharp sentence. Max 22 words.]\n` +
    `→ [Finding title, 6 words max] — [one sharp sentence. Max 22 words.]\n\n` +
    `BLANK LINE\n\n` +
    (changedContext ? `WHAT CHANGED: One sentence only. What is new or different compared to last week? Reference a specific signal that is emerging or confirmed. Start with "From last week:"\n\nBLANK LINE\n\n` : '') +
    `CLOSE: One sentence. What is worth watching or learning more about before next Monday? Direct. No clichés.\n\n` +
    `BLANK LINE\n\n` +
    `ATTRIBUTION LINE: Exactly this text: All findings this week \u2192 ynot.now\n\n` +
    `BLANK LINE\n\n` +
    `HASHTAGS LINE: Exactly this text: #InsurTech #AIinInsurance #Insurance #Innovation\n\n` +
    `Rules:\n` +
    `- Plain English. No jargon unless it is the precise term.\n` +
    `- Do not use: leverage, landscape, transformative, game-changer, revolutionise, unlock, ecosystem, synergy, paradigm, holistic, robust, seamless.\n` +
    `- No markdown, no bold, no asterisks — plain text only.\n` +
    `- Do not start any sentence with "I".\n` +
    `- Total post: 150–210 words.\n` +
    `- Return ONLY the post text, nothing else.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: 'You write the weekly post for YNOT.NOW, a free independent intelligence resource for anyone curious about AI in insurance (Life, Annuities, P&C, Horizontal Tech — NOT health insurance). Grounded, specific, educational. The goal is to inform and spark curiosity, not to advise or recommend. Plain text only — no markdown, no bold, no asterisks. Use → for bullets exactly as instructed. Follow the structure precisely.',
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) throw new Error('Claude ' + res.status);
  const d = await res.json();
  return { postText: d.content[0].text.trim(), agentSummary };
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
  const force   = req.query.force === 'true'; // bypass cache and regenerate

  try {
    // ── Try weekly_posts cache first (skip if force=true) ────────────────────
    let allPosts = null;
    if (!force) {
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
    }

    // ── Fall back: generate on-demand for last 2 runs ─────────────────────────
    if (!allPosts) {
      const { data: runRows } = await sbGet('findings?select=run_id,run_date,created_at&order=created_at.desc');
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
      for (let i = 0; i < runs.length; i++) {
        const run = runs[i];
        const { data: findings } = await sbGet(`findings?run_id=eq.${encodeURIComponent(run.run_id)}&order=verdict.asc,confidence.desc`);
        if (!findings || !findings.length) continue;
        // Pass previous week's findings for 'what changed' context
        let prevFindings = [];
        if (i < runs.length - 1) {
          const { data: pf } = await sbGet(`findings?run_id=eq.${encodeURIComponent(runs[i+1].run_id)}&select=title,signal_status&order=confidence.desc&limit=20`);
          prevFindings = pf || [];
        }
        const { postText, agentSummary } = await generateExecutiveBriefing(findings, run.run_date, prevFindings);
        generated.push({ run_id: run.run_id, run_date: run.run_date, post_text: postText, agent_summary: agentSummary, status: 'ready' });
      }
      if (!generated.length) {
        return res.status(200).json({ spotlight: null, archive: { posts: [], total: 0, page, limit } });
      }
      try { await sbPost('weekly_posts', generated); } catch (e) { /* table may not exist yet */ }
      allPosts = dedupByWeek(generated);
    }

    // ── Build response ──────────────────────────────────────────
    const spotlight = allPosts[0] || null;
    const archiveAll = allPosts.slice(1); // everything except the current week
    const archiveTotal = archiveAll.length;
    const archivePage = archiveAll.slice(page * limit, page * limit + limit);
    const totalPages = Math.ceil(archiveTotal / limit);

    // ── Fetch top findings for the spotlight run (for expandable bullets) ──────
    let topFindings = [];
    if (spotlight && (section === 'spotlight' || section === 'all')) {
      try {
        const { data: fd } = await sbGet(
          `findings?run_id=eq.${encodeURIComponent(spotlight.run_id)}&order=freshness_priority.asc,confidence.desc&limit=15`
        );
        if (fd && fd.length) {
          // Return top 5 SIGNALs + WATCHes (prioritized by freshness), with key fields only
          topFindings = fd
            .filter(f => f.verdict === 'SIGNAL' || f.verdict === 'WATCH')
            .slice(0, 5)
            .map(f => ({
              id: f.id,
              title: f.title,
              verdict: f.verdict,
              domain: f.domain,
              subdomain: f.subdomain,
              trl: f.trl,
              confidence: f.confidence,
              body: f.body,
              refs: f.refs,
              freshness_flag: f.freshness_flag,
              source_published_date: f.source_published_date
            }));
        }
      } catch (e) {
        console.warn('[pulse] Could not fetch top findings:', e.message);
      }
    }

    if (section === 'spotlight') {
      return res.status(200).json({ spotlight, top_findings: topFindings });
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
      top_findings: topFindings,
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
