const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const MINDS = [
  { id:'scout', name:'Scout', icon:'🔭', domain:'P&C', prompt:`Find 3 AI innovations in P&C insurance. Return ONLY a JSON array: [{"title":"Computer Vision Damage Assessment","verdict":"SIGNAL","body":"CV models now assess auto damage from photos with 94% accuracy matching human adjusters. Deployed at 40+ carriers globally including Tractable partnerships.","confidence":5,"domain":"P&C","subdomain":"Claims","experiment":"Compare CV vs human adjuster accuracy on 1000 claims","trl":9,"regulatoryRisk":"low","refs":[{"label":"NAIC AI Report","url":"https://content.naic.org/sites/default/files/ai-report.pdf"}]}]` },
  { id:'vita', name:'Vita', icon:'🧬', domain:'Life', prompt:`Find 3 AI innovations in Life insurance. Return ONLY a JSON array: [{"title":"AI Accelerated Underwriting","verdict":"SIGNAL","body":"LLM-powered underwriting reduces decision time from weeks to minutes using EHR data. Multiple tier-1 carriers in production.","confidence":5,"domain":"Life","subdomain":"Underwriting","experiment":"Measure time-to-decision before and after deployment","trl":8,"regulatoryRisk":"medium","refs":[{"label":"Geneva Association","url":"https://www.genevaassociation.org"}]}]` },
  { id:'atlas', name:'Atlas', icon:'🌍', domain:'Reinsurance', prompt:`Find 3 AI innovations in reinsurance. Return ONLY a JSON array: [{"title":"ML Catastrophe Modeling","verdict":"SIGNAL","body":"ML models incorporate real-time satellite and climate data improving cat loss estimates by 30% over traditional models.","confidence":4,"domain":"Reinsurance","subdomain":"Cat Modeling","experiment":"Backtest ML vs traditional cat model on 10 years of events","trl":7,"regulatoryRisk":"low","refs":[{"label":"arXiv","url":"https://arxiv.org/search/?query=catastrophe+modeling+machine+learning"}]}]` },
  { id:'prism', name:'Prism', icon:'💎', domain:'Horizontal', prompt:`Find 3 horizontal tech innovations for insurance. Return ONLY a JSON array: [{"title":"Federated Learning for Fraud Detection","verdict":"WATCH","body":"Carriers sharing fraud signals without sharing raw data. Early pilots show 20% improvement in detection rates.","confidence":3,"domain":"Horizontal","subdomain":"Federated Learning","experiment":"Compare fraud detection rates with and without federation","trl":5,"regulatoryRisk":"medium","refs":[{"label":"arXiv Federated Learning","url":"https://arxiv.org/search/?query=federated+learning+insurance"}]}]` },
  { id:'null', name:'Null', icon:'⚔️', domain:'All', prompt:`Find 3 overhyped AI claims in insurance. Return ONLY a JSON array: [{"title":"Blockchain for Claims Processing","verdict":"NOISE","body":"Despite 2016-2020 hype, no major carrier has deployed blockchain claims at scale. Smart contract complexity and legacy integration costs proved prohibitive.","confidence":5,"domain":"P&C","subdomain":"Claims","experiment":"Survey top 20 carriers on blockchain claims deployment status","trl":3,"regulatoryRisk":"low","refs":[{"label":"FCA Innovation Report","url":"https://www.fca.org.uk/innovation"}]}]` },
  { id:'weave', name:'Weave', icon:'🕸️', domain:'All', prompt:`Find 3 second-order effects of AI in insurance. Return ONLY a JSON array: [{"title":"Synthetic Data Democratising Small Carrier Innovation","verdict":"SIGNAL","body":"Synthetic data generation allows carriers with limited claims history to train competitive ML models. Levels playing field vs large carriers.","confidence":4,"domain":"Horizontal","subdomain":"Data","experiment":"Compare model performance: synthetic vs real data at different sample sizes","trl":6,"regulatoryRisk":"medium","refs":[{"label":"EIOPA AI Governance","url":"https://www.eiopa.europa.eu/ai"}]}]` },
  { id:'deploy', name:'Deploy', icon:'🚀', domain:'All', prompt:`Find 3 AI solutions proven at scale in insurance today. Return ONLY a JSON array: [{"title":"NLP First Notice of Loss Automation","verdict":"SIGNAL","body":"NLP automates 60-80% of FNOL intake across voice, email and chat. ROI proven at 18 months or less at carriers including Zurich and Allianz.","confidence":5,"domain":"P&C","subdomain":"Claims","experiment":"Measure FNOL handling cost per claim before and after","trl":9,"regulatoryRisk":"low","refs":[{"label":"NAIC","url":"https://content.naic.org"}]}]` },
  { id:'faro', name:'Faro', icon:'🔦', domain:'All', prompt:`Find 3 emerging insurance AI signals for 18-36 months ahead. Return ONLY a JSON array: [{"title":"Actuarial Foundation Models","verdict":"WATCH","body":"Large language models fine-tuned on actuarial data showing early promise for pricing and reserving. 3-5 academic papers published in 2024.","confidence":3,"domain":"Life","subdomain":"Actuarial","experiment":"Track number of carrier pilots launching in next 12 months","trl":4,"regulatoryRisk":"high","refs":[{"label":"arXiv Actuarial AI","url":"https://arxiv.org/search/?query=actuarial+foundation+model"}]}]` }
];

async function supabaseCall(method, table, body, query='') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
  };
  if (method === 'POST') headers['Prefer'] = 'return=representation';
  
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
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
      system: 'Respond ONLY with a valid JSON array. No markdown. Start with [ end with ].',
      messages: [{ role: 'user', content: mind.prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json();
  const raw = data.content?.map(c => c.text||'').join('')||'';
  let parsed;
  try { parsed = JSON.parse(raw.replace(/```json|```/g,'').trim()); }
  catch { const m = raw.match(/\[[\s\S]*\]/); if (!m) throw new Error('parse fail'); parsed = JSON.parse(m[0]); }
  return parsed.map(f => ({...f, mind_id:mind.id, mind_name:mind.name, mind_icon:mind.icon}));
}

export const handler = async (event) => {
  const auth = event.headers['authorization'] || event.headers['Authorization'] || '';
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  // Test Supabase connection first
  try {
    await supabaseCall('GET', 'findings', null, '?limit=1');
  } catch(err) {
    return { 
      statusCode: 500, 
      body: JSON.stringify({ 
        error: 'Supabase connection failed', 
        details: err.message,
        url_set: !!SUPABASE_URL,
        key_set: !!SUPABASE_KEY,
        url_preview: SUPABASE_URL ? SUPABASE_URL.substring(0,30) : 'MISSING'
      }) 
    };
  }

  const runDate = new Date().toISOString().split('T')[0];
  const runId = `run_${Date.now()}`;
  const allFindings = [];
  const errors = [];

  const outcomes = await Promise.allSettled(MINDS.map(m => callMind(m)));
  outcomes.forEach((o,i) => {
    if (o.status === 'fulfilled') allFindings.push(...o.value);
    else errors.push({ mind: MINDS[i].id, error: o.reason?.message });
  });

  if (allFindings.length === 0) {
    return { statusCode: 500, body: JSON.stringify({ error: 'All minds failed', errors }) };
  }

  const rows = allFindings.map(f => ({
    run_id: runId, run_date: runDate,
    mind_id: f.mind_id, mind_name: f.mind_name, mind_icon: f.mind_icon,
    title: f.title, verdict: f.verdict, body: f.body,
    domain: f.domain, subdomain: f.subdomain||null,
    confidence: f.confidence||3, trl: f.trl||5,
    regulatory_risk: f.regulatoryRisk||'medium',
    experiment: f.experiment||null, refs: f.refs||[],
  }));

  try {
    await supabaseCall('POST', 'findings', rows);
  } catch(err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Storage failed', details: err.message }) };
  }

  return { 
    statusCode: 200, 
    body: JSON.stringify({ success: true, run_id: runId, findings_count: allFindings.length, errors }) 
  };
};
