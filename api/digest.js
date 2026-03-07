// api/digest.js
// Returns the last two weekly digest posts for the Weekly Pulse section.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const url = SUPABASE_URL + '/rest/v1/weekly_posts?order=run_date.desc&limit=2&status=eq.ready';
    const r = await fetch(url, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    if (!r.ok) throw new Error('Supabase ' + r.status);
    const rows = await r.json();
    return res.status(200).json({ posts: rows || [] });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
};
