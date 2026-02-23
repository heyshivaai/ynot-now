// api/visitors.js
// Tracks and returns page view count using Supabase.
//
// Required Supabase setup (run once in SQL editor):
//   create table if not exists counters (
//     id text primary key,
//     count bigint default 0
//   );
//   insert into counters (id, count) values ('page_views', 0);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function sb(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const rows = await sb('GET', 'counters?id=eq.page_views&select=count');
    const current = rows?.[0]?.count ?? 0;
    const next = current + 1;

    if (!rows?.length) {
      await sb('POST', 'counters', { id: 'page_views', count: 1 });
    } else {
      await sb('PATCH', 'counters?id=eq.page_views', { count: next });
    }

    return res.status(200).json({ count: next });
  } catch (e) {
    return res.status(200).json({ count: 0 });
  }
};
