// api/linkedin.js
// Generates a LinkedIn-native post draft for the current week's findings.
//
// GET /api/linkedin          → returns the latest week's LinkedIn draft (generates + caches if needed)
// GET /api/linkedin?run_id=X → returns the draft for a specific run
//
// The draft is cached in the weekly_posts table as linkedin_post column.
// If the column doesn't exist yet, it falls back to generating on-demand without caching.

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

async function sbPatch(table, filter, body) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + filter, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(body)
  });
  // 404 or missing column is non-fatal — we just skip caching
  return res.ok;
}

async function generateLinkedInPost(findings, runDate) {
  const signals  = findings.filter(f => f.verdict === 'SIGNAL');
  const watches  = findings.filter(f => f.verdict === 'WATCH');
  const noises   = findings.filter(f => f.verdict === 'NOISE');

  // Pick the 3 most compelling findings for the bullets: prioritise high-confidence SIGNALs,
  // then WATCHes, then include one NOISE if it's interesting
  const ranked = [
    ...signals.sort((a, b) => (b.confidence || 0) - (a.confidence || 0)),
    ...watches.sort((a, b) => (b.confidence || 0) - (a.confidence || 0)),
    ...noises.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
  ].slice(0, 5);

  const bulletData = ranked.map(f => {
    const trlLabel = {
      9: 'Proven', 8: 'Proven', 7: 'Standard', 6: 'Standard',
      5: 'Pilot', 4: 'Pilot', 3: 'Experiment', 2: 'Experiment', 1: 'Idea'
    }[f.trl] || 'Watch';
    return `[${f.verdict} · ${trlLabel}] ${f.title} (${f.domain}/${f.subdomain}): ${(f.body || '').slice(0, 180)}`;
  }).join('\n\n');

  const prompt =
`You are writing a LinkedIn post for Shiva Balasubramaniyan — an independent insurance technology analyst and the founder of YNOT.NOW, a weekly AI signal tracker for the insurance industry.

The post goes out every Monday. The audience is senior insurance executives, CTOs, Chief Innovation Officers, and emerging tech leaders in the insurance and reinsurance space. They are time-poor, skeptical of hype, and respect specificity over generality.

Week of ${runDate}. The eight specialist agents scanned the market and found ${findings.length} findings: ${signals.length} Signal, ${watches.length} Watch, ${noises.length} Noise.

TOP FINDINGS THIS WEEK:
${bulletData}

Write a LinkedIn post using EXACTLY this structure — no deviations:

LINE 1 (Hook): One sentence. Specific. Slightly provocative or surprising. Must reference a real finding from the data above. No generic openers like "This week in AI" or "AI is transforming". Make it feel like something a sharp practitioner would say out loud.

BLANK LINE

LINE 2–3 (Context): One or two sentences that give the hook meaning. What does this finding actually mean for the industry? Be direct. No hedging.

BLANK LINE

BULLETS (exactly 3, each on its own line starting with →):
→ [Finding title, 6 words max] — [one sharp sentence: what it is + why it matters to an insurance leader. Max 20 words.]
→ [Finding title, 6 words max] — [one sharp sentence. Max 20 words.]
→ [Finding title, 6 words max] — [one sharp sentence. Max 20 words.]

BLANK LINE

CLOSE: One sentence. Forward-looking. What should leaders be doing or watching? No clichés like "the future is now".

BLANK LINE

ATTRIBUTION: Exactly this text on its own line: Full analysis + all findings → ynot.now

BLANK LINE

HASHTAGS: Exactly this line: #InsurTech #AIinInsurance #Insurance #Innovation

Rules:
- Total post length: 150–220 words
- No markdown, no bold, no asterisks — plain text only
- No em-dashes (—) in the hook or close — use a period or comma instead
- Do not start any sentence with "I"
- Do not use the word "leverage", "landscape", "transformative", "game-changer", "revolutionise", "unlock", or "ecosystem"
- The post must read like a human wrote it on a Monday morning, not like a press release
- Return ONLY the post text, nothing else`;

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
      system: `You are a ghostwriter for a senior insurance technology analyst. You write sharp, opinionated LinkedIn posts that sound like a real practitioner, not an AI. Plain text only. No formatting. No bullet symbols other than →. No em-dashes.`,
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
    const requestedRunId = req.query.run_id || null;

    // ── Try to return cached LinkedIn post from weekly_posts ──────────────────
    try {
      const filter = requestedRunId
        ? `weekly_posts?run_id=eq.${encodeURIComponent(requestedRunId)}&status=eq.ready&limit=1`
        : `weekly_posts?order=run_date.desc&status=eq.ready&limit=1`;
      const cached = await sbGet(filter);
      if (cached && cached.length && cached[0].linkedin_post) {
        return res.status(200).json({
          run_id:   cached[0].run_id,
          run_date: cached[0].run_date,
          post:     cached[0].linkedin_post
        });
      }
    } catch (e) {
      console.warn('[linkedin] weekly_posts lookup failed:', e.message);
    }

    // ── Fetch the most recent run's findings ──────────────────────────────────
    let runId = requestedRunId;
    let runDate = null;

    if (!runId) {
      const runs = await sbGet('findings?select=run_id,run_date&order=run_date.desc&limit=1');
      if (!runs || !runs.length) {
        return res.status(200).json({ post: null, message: 'No findings yet.' });
      }
      runId   = runs[0].run_id;
      runDate = runs[0].run_date;
    }

    const findings = await sbGet(
      `findings?run_id=eq.${encodeURIComponent(runId)}&order=confidence.desc`
    );
    if (!findings || !findings.length) {
      return res.status(200).json({ post: null, message: 'No findings for this run.' });
    }
    if (!runDate) runDate = findings[0].run_date;

    // ── Generate the LinkedIn post ────────────────────────────────────────────
    const post = await generateLinkedInPost(findings, runDate);

    // ── Cache it back to weekly_posts.linkedin_post (best-effort) ────────────
    try {
      await sbPatch(
        'weekly_posts',
        `run_id=eq.${encodeURIComponent(runId)}`,
        { linkedin_post: post }
      );
    } catch (e) {
      console.warn('[linkedin] Could not cache linkedin_post:', e.message);
    }

    return res.status(200).json({ run_id: runId, run_date: runDate, post });

  } catch (err) {
    console.error('[linkedin] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
