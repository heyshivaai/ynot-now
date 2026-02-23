// api/visitors.js — Visitor counter (live sessions + total views)
// Requires Vercel KV: set KV_REST_API_URL + KV_REST_API_TOKEN in env vars
// Falls back gracefully to null if KV not connected

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kv(cmd, ...args) {
  if (!KV_URL || !KV_TOKEN) return null;
  const url = `${KV_URL}/${[cmd,...args].map(encodeURIComponent).join('/')}`;
  const res  = await fetch(url, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
  if (!res.ok) return null;
  return (await res.json()).result;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const total   = await kv('INCR', 'ynot:total_views');
    const ip      = req.headers['x-forwarded-for']?.split(',')[0] || 'anon';
    const bucket  = Math.floor(Date.now() / (3 * 60 * 1000));
    await kv('SET', `ynot:sess:${ip}:${bucket}`, '1', 'EX', '180');

    let live = 1;
    if (KV_URL && KV_TOKEN) {
      const r = await fetch(
        `${KV_URL}/scan/0/match/${encodeURIComponent('ynot:sess:*')}/count/100`,
        { headers: { Authorization: `Bearer ${KV_TOKEN}` } }
      );
      if (r.ok) {
        const j = await r.json();
        live = Math.max(1, Array.isArray(j.result?.[1]) ? j.result[1].length : 1);
      }
    }
    return res.status(200).json({ total: total || 1, live });
  } catch(e) {
    return res.status(200).json({ total: null, live: null });
  }
};
