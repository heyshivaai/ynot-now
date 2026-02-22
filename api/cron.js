// api/cron.js
// Runs weekly via Vercel Cron (configured in vercel.json)
// Calls all 8 minds, stores findings to Supabase with full history
// Cost: ~$0.15 per weekly run regardless of visitor traffic

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const CRON_SECRET  = process.env.CRON_SECRET;

const MINDS = [
  {
    id: 'scout', name: 'Scout', icon: '🔭', domain: 'P&C',
    prompt: `You are Scout, a P&C insurance AI specialist. Identify 3 specific, evidenced AI innovations in P&C insurance (auto, home, commercial, specialty). Be concrete — cite real deployments, give numbers where they exist. Cover: agentic claims orchestration, computer vision damage assessment, telematics+LLM pricing, fraud ring GNNs, NLP submission intake, digital twin property risk, FNOL AI.
Return ONLY a JSON array — no markdown:
[{"title":"...","verdict":"SIGNAL|NOISE|WATCH","body":"2-3 sentences with specific evidence and deployment examples","confidence":1-5,"domain":"P&C","subdomain":"Claims|Underwriting|Fraud|Commercial|Auto","experiment":"one testable hypothesis","trl":1-9,"regulatoryRisk":"low|medium|high","refs":[{"label":"readable source name","url":"https://..."}]}]`
  },
  {
    id: 'vita', name: 'Vita', icon: '🧬', domain: 'Life',
    prompt: `You are Vita, a Life/Annuities/Health AI specialist. Identify 3 specific AI innovations transforming Life and Health insurance. Cover: AI accelerated underwriting, wearable risk scoring, continuous underwriting, longevity modeling, mental health risk AI, benefit admin automation, actuarial foundation models.
Return ONLY a JSON array — no markdown:
[{"title":"...","verdict":"SIGNAL|NOISE|WATCH","body":"2-3 sentences with evidence and deployment examples","confidence":1-5,"domain":"Life","subdomain":"Life Insurance|Annuities|Health|Group Benefits","experiment":"testable hypothesis","trl":1-9,"regulatoryRisk":"low|medium|high","refs":[{"label":"readable source name","url":"https://..."}]}]`
  },
  {
    id: 'atlas', name: 'Atlas', icon: '🌍', domain: 'Reinsurance',
    prompt: `You are Atlas, reinsurance and cat modeling AI specialist. Identify 3 specific AI innovations reshaping reinsurance and climate risk. Cover: ML cat models, satellite imagery, parametric trigger AI, climate projections, synthetic cat data, treaty language NLP, drone imagery.
Return ONLY a JSON array — no markdown:
[{"title":"...","verdict":"SIGNAL|NOISE|WATCH","body":"2-3 sentences with evidence","confidence":1-5,"domain":"Reinsurance","subdomain":"Cat Modeling|Parametric|Climate Risk|Treaty","experiment":"testable hypothesis","trl":1-9,"regulatoryRisk":"low|medium|high","refs":[{"label":"readable source name","url":"https://..."}]}]`
  },
  {
    id: 'prism', name: 'Prism', icon: '💎', domain: 'Horizontal',
    prompt: `You are Prism, horizontal technology analyst for insurance. Identify 3 specific innovations across PQC, digital twins, AIO, tokenization, federated learning, digital wallets. Be honest — blockchain for claims has largely failed, PQC and digital twins are genuinely emerging.
Return ONLY a JSON array — no markdown:
[{"title":"...","verdict":"SIGNAL|NOISE|WATCH","body":"2-3 sentences honest about implementation reality","confidence":1-5,"domain":"Horizontal","subdomain":"Blockchain|Tokenization|Digital Twin|Post-Quantum Crypto|AIO|Federated Learning|Digital Wallet","experiment":"testable hypothesis","trl":1-9,"regulatoryRisk":"low|medium|high","refs":[{"label":"readable source name","url":"https://..."}]}]`
  },
  {
    id: 'null', name: 'Null', icon: '⚔️', domain: 'All',
    prompt: `You are Null, insurance AI evidence checker. Identify 3 claims in insurance AI that deserve more scrutiny — where evidence is thin, deployments are limited, or outcomes haven't matched expectations. Be specific but fair.
Return ONLY a JSON array — no markdown:
[{"title":"the claim stated fairly","verdict":"NOISE|SIGNAL|WATCH","body":"2-3 sentences: current evidence, what's proven, what's not yet proven","confidence":1-5,"domain":"P&C|Life|Reinsurance|Horizontal","subdomain":"...","experiment":"how to fairly test or confirm the claim","trl":1-9,"regulatoryRisk":"low|medium|high","refs":[{"label":"readable source name","url":"https://..."}]}]`
  },
  {
    id: 'weave', name: 'Weave', icon: '🕸️', domain: 'All',
    prompt: `You are Weave, mapping 2nd/3rd order effects of AI across insurance. Identify 3 non-obvious systemic shifts: synthetic data broadening access, explainability as regulatory readiness, agentic AI reshaping distribution economics, AIO transforming operations, continuous underwriting collapsing annual cycles.
Return ONLY a JSON array — no markdown:
[{"title":"systemic shift named precisely","verdict":"SIGNAL|NOISE|WATCH","body":"2-3 sentences on 2nd-order effect and why it matters now","confidence":1-5,"domain":"P&C|Life|Reinsurance|Horizontal","subdomain":"Distribution|Underwriting|Data|Regulatory|Operations","experiment":"how to monitor this shift","trl":1-9,"regulatoryRisk":"low|medium|high","refs":[{"label":"readable source name","url":"https://..."}]}]`
  },
  {
    id: 'deploy', name: 'Deploy', icon: '🚀', domain: 'All',
    prompt: `You are Deploy, insurance AI implementation specialist. Identify 3 AI innovations deployable TODAY with proven ROI — in production at multiple carriers globally, payback under 18 months, works with legacy systems. Focus on what's genuinely proven at scale.
Return ONLY a JSON array — no markdown:
[{"title":"specific deployable solution","verdict":"SIGNAL|NOISE|WATCH","body":"implementation reality — what it takes, what it returns, what to watch for","confidence":1-5,"domain":"P&C|Life|Reinsurance|Horizontal","subdomain":"...","experiment":"success metric and test design","trl":1-9,"regulatoryRisk":"low|medium|high","refs":[{"label":"readable source name","url":"https://..."}]}]`
  },
  {
    id: 'faro', name: 'Faro', icon: '🔦', domain: 'All',
    prompt: `You are Faro, insurance AI horizon scanner for 18-36 month emerging signals. Identify 3 genuine early signals that will reshape insurance: actuarial foundation models, agentic broker networks, AI-native embedded insurance, continuous underwriting via IoT+LLM, PQC migration timelines, digital twin ecosystems.
Return ONLY a JSON array — no markdown:
[{"title":"named emerging shift","verdict":"SIGNAL|WATCH|NOISE","body":"early signal evidence and leading indicators — what's already showing up","confidence":1-5,"domain":"P&C|Life|Reinsurance|Horizontal","subdomain":"...","experiment":"what to monitor to confirm the signal","trl":1-9,"regulatoryRisk":"low|medium|high","refs":[{"label":"readable source name","url":"https://..."}]}]`
  }
];

async function supabase(method, table, body = null, query = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': method === 'POST' ? 'return=representation' : '',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${method} ${table}: ${err}`);
  }
  return method === 'DELETE' ? null : res.json();
}

async function callMind(mind) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      system: 'You are a specialist AI insurance intelligence mind. Respond ONLY with a valid JSON array. No markdown fences, no preamble. Start with [ end with ]. Each item MUST include a refs array with 1-3 objects having label and url fields pointing to real, verifiable sources (arXiv, NAIC, FCA, EIOPA, academic institutions, established research orgs). Only use sources that genuinely exist.',
      messages: [{ role: 'user', content: mind.prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);

  const data = await res.json();
  const raw = data.content?.map(c => c.text || '').join('') || '';

  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error(`Could not parse response for ${mind.id}`);
    parsed = JSON.parse(match[0]);
  }

  return parsed.map(finding => ({
    ...finding,
    mind_id:   mind.id,
    mind_name: mind.name,
    mind_icon: mind.icon,
  }));
}

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const runDate = new Date().toISOString().split('T')[0];
  const runId   = `run_${Date.now()}`;
  const results = { run_id: runId, run_date: runDate, findings: [], errors: [] };

  const outcomes = await Promise.allSettled(MINDS.map(mind => callMind(mind)));

  outcomes.forEach((outcome, i) => {
    const mind = MINDS[i];
    if (outcome.status === 'fulfilled') {
      results.findings.push(...outcome.value);
    } else {
      results.errors.push({ mind: mind.id, error: outcome.reason?.message });
    }
  });

  if (results.findings.length === 0) {
    return res.status(500).json({ error: 'All minds failed', details: results.errors });
  }

  const rows = results.findings.map(f => ({
    run_id:          runId,
    run_date:        runDate,
    mind_id:         f.mind_id,
    mind_name:       f.mind_name,
    mind_icon:       f.mind_icon,
    title:           f.title,
    verdict:         f.verdict,
    body:            f.body,
    domain:          f.domain,
    subdomain:       f.subdomain || null,
    confidence:      f.confidence || 3,
    trl:             f.trl || 5,
    regulatory_risk: f.regulatoryRisk || 'medium',
    experiment:      f.experiment || null,
    refs:            f.refs || [],
  }));

  try {
    await supabase('POST', 'findings', rows);
  } catch (err) {
    return res.status(500).json({ error: 'Storage failed', details: err.message });
  }

  for (const f of results.findings) {
    const key = f.title.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 80);
    try {
      const existing = await supabase('GET', 'trl_history', null,
        `?technology_key=eq.${encodeURIComponent(key)}&order=recorded_at.desc&limit=1`
      );
      const lastTrl = existing?.[0]?.trl;
      if (!existing?.length || lastTrl !== f.trl) {
        await supabase('POST', 'trl_history', {
          technology_key:  key,
          technology_name: f.title,
          domain:          f.domain,
          trl:             f.trl,
          verdict:         f.verdict,
          recorded_at:     new Date().toISOString(),
          run_id:          runId,
          previous_trl:    lastTrl || null,
          direction:       lastTrl ? (f.trl > lastTrl ? 'up' : f.trl < lastTrl ? 'down' : 'stable') : 'new',
        });
      }
    } catch (err) {
      console.warn(`trl_history skipped for ${key}:`, err.message);
    }
  }

  return res.status(200).json({
    success:        true,
    run_id:         runId,
    run_date:       runDate,
    findings_count: results.findings.length,
    errors:         results.errors,
  });
}
