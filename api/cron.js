const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const MINDS = [
  { id:'scout', name:'Scout', icon:'🔭', domain:'P&C', prompt:`You are Scout, P&C insurance AI specialist. Find 3 evidenced AI innovations in P&C insurance. Return ONLY a JSON array: [{"title":"...","verdict":"SIGNAL","body":"evidence here","confidence":4,"domain":"P&C","subdomain":"Claims","experiment":"hypothesis","trl":7,"regulatoryRisk":"low","refs":[{"label":"NAIC","url":"https://naic.org"}]}]` },
  { id:'vita', name:'Vita', icon:'🧬', domain:'Life', prompt:`You are Vita, Life/Health AI specialist. Find 3 AI innovations in Life insurance. Return ONLY a JSON array: [{"title":"...","verdict":"SIGNAL","body":"evidence here","confidence":4,"domain":"Life","subdomain":"Underwriting","experiment":"hypothesis","trl":7,"regulatoryRisk":"low","refs":[{"label":"arXiv","url":"https://arxiv.org"}]}]` },
  { id:'atlas', name:'Atlas', icon:'🌍', domain:'Reinsurance', prompt:`You are Atlas, reinsurance AI specialist. Find 3 AI innovations in reinsurance. Return ONLY a JSON array: [{"title":"...","verdict":"SIGNAL","body":"evidence here","confidence":4,"domain":"Reinsurance","subdomain":"Cat Modeling","experiment":"hypothesis","trl":6,"regulatoryRisk":"low","refs":[{"label":"Geneva Association","url":"https://genevaassociation.org"}]}]` },
  { id:'prism', name:'Prism', icon:'💎', domain:'Horizontal', prompt:`You are Prism, horizontal tech analyst. Find 3 innovations across PQC, digital twins, federated learning. Return ONLY a JSON array: [{"title":"...","verdict":"WATCH","body":"honest assessment","confidence":3,"domain":"Horizontal","subdomain":"Digital Twin","experiment":"hypothesis","trl":5,"regulatoryRisk":"medium","refs":[{"label":"NIST","url":"https://nist.gov"}]}]` },
  { id:'null', name:'Null', icon:'⚔️', domain:'All', prompt:`You are Null, evidence checker. Find 3 overhyped insurance AI claims. Return ONLY a JSON array: [{"title":"claim","verdict":"NOISE","body":"what evidence shows","confidence":4,"domain":"P&C","subdomain":"Claims","experiment":"how to test","trl":4,"regulatoryRisk":"low","refs":[{"label":"FCA","url":"https://fca.org.uk"}]}]` },
  { id:'weave', name:'Weave', icon:'🕸️', domain:'All', prompt:`You are Weave, systems thinker. Find 3 second-order effects of AI in insurance. Return ONLY a JSON array: [{"title":"shift","verdict":"SIGNAL","body":"systemic effect","confidence":3,"domain":"Horizontal","subdomain":"Operations","experiment":"monitor this","trl":5,"regulatoryRisk":"medium","refs":[{"label":"EIOPA","url":"https://eiopa.europa.eu"}]}]` },
  { id:'deploy', name:'Deploy', icon:'🚀', domain:'All', prompt:`You are Deploy, implementation specialist. Find 3 AI solutions deployable TODAY with proven ROI. Return ONLY a JSON array: [{"title":"solution","verdict":"SIGNAL","body":"ROI and implementation","confidence":5,"domain":"P&C","subdomain":"Claims","experiment":"success metric","trl":9,"regulatoryRisk":"low","refs":[{"label":"arXiv","url":"https://arxiv.org"}]}]` },
  { id:'faro', name:'Faro', icon:'🔦', domain:'All', prompt:`You are Faro, horizon scanner. Find 3 emerging signals for insurance in 18-36 months. Return ONLY a JSON array: [{"title":"signal","verdict":"WATCH","body":"early evidence","confidence":3,"domain":"Life","subdomain":"Underwriting","experiment":"what to monitor","trl":4,"regulatoryRisk":"medium","refs":[{"label":"arXiv","url":"https://arxiv.org"}]}]` }
];

async function supabaseCall(method, table, body, query='') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method,
    headers: { 'Content-Type':'application/json', 'apikey':SUPABASE_KEY, 'Authorization':`Bearer ${SUPABASE_KEY}`, 'Prefer': method==='POST'?'return=representation':'' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return method==='DELETE' ? null : res.json();
}

async function callMind(mind) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'x-api-key':ANTHROPIC_KEY, 'anthropic-version':'2023-06-01' },
    body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:1200, system:'Respond ONLY with a valid JSON array. No markdown. Start with [ end with ].', messages:[{role:'user',content:mind.prompt}] }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json();
  const raw = data.content?.map(c=>c.text||'').join('')||'';
  let parsed;
  try { parsed = JSON.parse(raw.replace(/```json|```/g,'').trim()); }
  catch { const m=raw.match(/\[[\s\S]*\]/); if(!m) throw new Error('parse fail'); parsed=JSON.parse(m[0]); }
  return parsed.map(f=>({...f, mind_id:mind.id, mind_name:mind.name, mind_icon:mind.icon}));
}

export const handler = async (event) => {
  const auth = event.headers['authorization'] || event.headers['Authorization'] || '';
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return { statusCode:401, body: JSON.stringify({error:'Unauthorized'}) };
  }

  const runDate = new Date().toISOString().split('T')[0];
  const runId = `run_${Date.now()}`;
  const allFindings = [];
  const errors = [];

  const outcomes = await Promise.allSettled(MINDS.map(m=>callMind(m)));
  outcomes.forEach((o,i) => {
    if (o.status==='fulfilled') allFindings.push(...o.value);
    else errors.push({mind:MINDS[i].id, error:o.reason?.message});
  });

  if (allFindings.length===0) {
    return { statusCode:500, body: JSON.stringify({error:'All minds failed', errors}) };
  }

  const rows = allFindings.map(f=>({
    run_id:runId, run_date:runDate,
    mind_id:f.mind_id, mind_name:f.mind_name, mind_icon:f.mind_icon,
    title:f.title, verdict:f.verdict, body:f.body,
    domain:f.domain, subdomain:f.subdomain||null,
    confidence:f.confidence||3, trl:f.trl||5,
    regulatory_risk:f.regulatoryRisk||'medium',
    experiment:f.experiment||null, refs:f.refs||[],
  }));

  try { await supabaseCall('POST','findings',rows); }
  catch(err) { return { statusCode:500, body:JSON.stringify({error:'Storage failed',details:err.message}) }; }

  for (const f of allFindings) {
    const key = f.title.toLowerCase().replace(/[^a-z0-9]/g,'_').substring(0,80);
    try {
      const existing = await supabaseCall('GET','trl_history',null,`?technology_key=eq.${encodeURIComponent(key)}&order=recorded_at.desc&limit=1`);
      const lastTrl = existing?.[0]?.trl;
      if (!existing?.length || lastTrl!==f.trl) {
        await supabaseCall('POST','trl_history',{
          technology_key:key, technology_name:f.title, domain:f.domain,
          trl:f.trl, verdict:f.verdict, recorded_at:new Date().toISOString(),
          run_id:runId, previous_trl:lastTrl||null,
          direction:lastTrl?(f.trl>lastTrl?'up':f.trl<lastTrl?'down':'stable'):'new',
        });
      }
    } catch(e) { console.warn('trl_history skip',key); }
  }

  return { statusCode:200, body:JSON.stringify({success:true, run_id:runId, run_date:runDate, findings_count:allFindings.length, errors}) };
};
