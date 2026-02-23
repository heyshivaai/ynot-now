// api/findings.js
// Serves stored findings from Supabase to the frontend

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabaseGet(table, query = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase GET ${table}: ${err}`);
  }
  return res.json();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const latestRun = await supabaseGet('findings',
      '?select=run_id,run_date&order=created_at.desc&limit=1'
    );

    if (!latestRun?.length) {
      return res.status(200).json({
        findings: [],
        trajectory: [],
        run_date: null,
        total_runs: 0,
        message: 'No findings yet — first weekly run pending',
      });
    }

    const { run_id, run_date } = latestRun[0];

    const findings = await supabaseGet('findings',
      `?run_id=eq.${encodeURIComponent(run_id)}&order=verdict.asc,confidence.desc`
    );

    const trajectory = await supabaseGet('trl_history',
      '?order=recorded_at.asc&select=technology_name,domain,trl,verdict,recorded_at,direction,previous_trl'
    );

    const runCount = await supabaseGet('findings',
      '?select=run_id&order=run_date.desc'
    );
    const uniqueRuns = new Set(runCount.map(r => r.run_id)).size;

    const allFindings = await supabaseGet('findings', '?select=id');

    return res.status(200).json({
      findings:   findings,
      trajectory: trajectory,
      run_date:   run_date,
      total_runs: uniqueRuns,
      total_ever: allFindings.length,
    });

  } catch (err) {
    console.error('[YNOT FINDINGS] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
