// api/context-hub-pro.js
// Premium API tier for YNOT.NOW intelligence.
//
// Provides deeper data access than the free Context Hub endpoint:
// - Full signal trajectory history (weekly snapshots over time)
// - Raw intelligence sources per agent
// - Cross-agent agreement details
// - Historical findings (up to 52 weeks)
// - Custom domain queries
//
// Auth: Bearer token via CONTEXT_HUB_PRO_KEYS env var (comma-separated list)
//
// GET /api/context-hub-pro?endpoint=trajectories          → full trajectory history
// GET /api/context-hub-pro?endpoint=agreements            → cross-agent agreements
// GET /api/context-hub-pro?endpoint=raw&mind=scout        → raw Tavily results per agent
// GET /api/context-hub-pro?endpoint=findings&weeks=52     → up to 1 year of findings
// GET /api/context-hub-pro?endpoint=stats                 → usage stats + platform health

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Comma-separated API keys — set in Vercel env vars
// For now, empty means the endpoint returns a "coming soon" response
const PRO_KEYS = (process.env.CONTEXT_HUB_PRO_KEYS || '').split(',').filter(Boolean);

function authenticate(req) {
  if (PRO_KEYS.length === 0) return 'no-keys-configured';
  const auth = req.headers['authorization'] || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  return PRO_KEYS.includes(token) ? token : null;
}

async function supabaseGet(path) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  if (!res.ok) throw new Error('Supabase ' + res.status);
  return res.json();
}

// Log pro API usage
function logProUsage(req, endpoint, resultCount) {
  try {
    fetch(SUPABASE_URL + '/rest/v1/api_usage', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        endpoint: 'context-hub-pro',
        domain_filter: endpoint,
        format: 'json',
        consumer_type: 'pro-api',
        user_agent: (req.headers['user-agent'] || '').slice(0, 500),
        referer: (req.headers['referer'] || '').slice(0, 500),
        findings_served: resultCount,
        created_at: new Date().toISOString()
      })
    }).catch(() => {});
  } catch (e) { /* never block */ }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Auth check
  const authResult = authenticate(req);
  if (authResult === 'no-keys-configured') {
    return res.status(200).json({
      status: 'coming-soon',
      message: 'YNOT.NOW Pro API — deeper insurance AI intelligence, coming soon.',
      free_endpoint: 'https://ynot-now.vercel.app/api/context-hub',
      available_endpoints: ['trajectories', 'agreements', 'raw', 'findings', 'stats'],
      description: {
        trajectories: 'Full signal trajectory history — how topics evolve week-over-week with compound scoring',
        agreements: 'Cross-agent agreement index — topics where multiple agents independently converge',
        raw: 'Raw Tavily search results per agent per run — see exactly what each mind found',
        findings: 'Up to 52 weeks of findings history (free tier: 8 weeks max)',
        stats: 'Platform health metrics + API usage analytics'
      },
      contact: 'shiva@rentai.now'
    });
  }

  if (!authResult) {
    return res.status(401).json({ error: 'Invalid or missing API key. Include: Authorization: Bearer <key>' });
  }

  try {
    const endpoint = req.query.endpoint || 'trajectories';

    let data;
    let count = 0;

    switch (endpoint) {
      case 'trajectories': {
        data = await supabaseGet('signal_trajectories?order=compound_score.desc&limit=100');
        count = data.length;
        break;
      }
      case 'agreements': {
        const weeks = Math.min(parseInt(req.query.weeks || '4', 10), 52);
        const cutoff = new Date();
        cutoff.setUTCDate(cutoff.getUTCDate() - (weeks * 7));
        data = await supabaseGet(
          `cross_agent_agreements?run_date=gte.${cutoff.toISOString().split('T')[0]}&order=agreement_strength.desc&limit=100`
        );
        count = data.length;
        break;
      }
      case 'raw': {
        const mind = req.query.mind || null;
        const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
        let query = `intelligence_raw?order=created_at.desc&limit=${limit}`;
        if (mind) query += `&mind_id=eq.${mind}`;
        data = await supabaseGet(query);
        count = data.length;
        break;
      }
      case 'findings': {
        const weeks = Math.min(parseInt(req.query.weeks || '12', 10), 52);
        const domain = req.query.domain || null;
        const cutoff = new Date();
        cutoff.setUTCDate(cutoff.getUTCDate() - (weeks * 7));
        let query = `findings?created_at=gte.${cutoff.toISOString().split('T')[0]}&order=created_at.desc&limit=500`;
        data = await supabaseGet(query);
        if (domain) {
          data = data.filter(f => (f.domain || '').toLowerCase().includes(domain.toLowerCase()));
        }
        count = data.length;
        break;
      }
      case 'stats': {
        const [findings, trajectories, agreements, usage] = await Promise.all([
          supabaseGet('findings?select=id&order=created_at.desc&limit=1'),
          supabaseGet('signal_trajectories?select=id&limit=1000'),
          supabaseGet('cross_agent_agreements?select=id&limit=1000'),
          supabaseGet('api_usage?select=id,consumer_type,created_at&order=created_at.desc&limit=500').catch(() => [])
        ]);

        // Usage breakdown (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
        const recentUsage = Array.isArray(usage) ? usage.filter(u => new Date(u.created_at) > thirtyDaysAgo) : [];
        const byType = {};
        recentUsage.forEach(u => { byType[u.consumer_type] = (byType[u.consumer_type] || 0) + 1; });

        data = {
          platform: {
            total_findings_ever: findings.length > 0 ? 'active' : 'empty',
            signal_trajectories_tracked: trajectories.length,
            cross_agent_agreements: agreements.length,
          },
          api_usage_last_30_days: {
            total_requests: recentUsage.length,
            by_consumer_type: byType
          }
        };
        count = 1;
        break;
      }
      default:
        return res.status(400).json({
          error: 'Unknown endpoint. Use: trajectories, agreements, raw, findings, stats'
        });
    }

    logProUsage(req, endpoint, count);

    return res.status(200).json({
      source: 'YNOT.NOW Pro',
      endpoint: endpoint,
      generated_at: new Date().toISOString(),
      count: count,
      data: data
    });

  } catch (err) {
    console.error('[context-hub-pro] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
