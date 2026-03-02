const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

function normalizeVerdict(v){v=(v||'').toUpperCase();if(v.indexOf('SIGNAL')>=0)return 'SIGNAL';if(v.indexOf('NOISE')>=0)return 'NOISE';return 'WATCH';}
function normalizeRisk(r){r=(r||'').toLowerCase();if(r.indexOf('high')>=0)return 'high';if(r.indexOf('low')>=0)return 'low';return 'medium';}
function clamp(v,a,b){var n=parseInt(v);return isNaN(n)?3:Math.min(b,Math.max(a,n));}
const MINDS = [
  { id:'scout', name:'Scout', icon:'🔭', domain:'P&C', prompt:`Find 3 AI innovations in P&C insurance. Return ONLY a JSON array: [{"title":"Computer Vision Claims","verdict":"SIGNAL","body":"CV models assess damage from photos with 94% accuracy.","confidence":5,"domain":"P&C","subdomain":"Claims","experiment":"test hypothesis","trl":9,"regulatoryRisk":"low","refs":[{"label":"NAIC","url":"https://content.naic.org"}]}]` },
  { id:'vita', name:'Vita', icon:'🧬', domain:'Life', prompt:`Find 3 AI innovations in Life insurance. Return ONLY a JSON array: [{"title":"AI Underwriting","verdict":"SIGNAL","body":"LLM underwriting cuts decision time from weeks to minutes.","confidence":5,"domain":"Life","subdomain":"Underwriting","experiment":"test hypothesis","trl":8,"regulatoryRisk":"medium","refs":[{"label":"arXiv","url":"https://arxiv.org"}]}]` },
  { id:'atlas', name:'Atlas', icon:'🌍', domain:'Reinsurance', prompt:`Find 3 AI innovations in reinsurance. Return ONLY a JSON array: [{"title":"ML Cat Models","verdict":"SIGNAL","body":"ML improves cat loss estimates by 30%.","confidence":4,"domain":"Reinsurance","subdomain":"Cat Modeling","experiment":"test hypothesis","trl":7,"regulatoryRisk":"low","refs":[{"label":"Geneva Association","url":"https://www.genevaassociation.org"}]}]` },
  { id:'prism', name:'Prism', icon:'💎', domain:'Horizontal', prompt:`You are Prism 💎, YNOT.NOW's Horizontal Technology Scanner for the insurance industry. Your job is to find technology shifts happening across enterprise IT broadly, then surface the insurance-specific implication or deployment.

SCAN THESE CATEGORIES every run — look for news, releases, deployments, research, and VC signals in each:

1. AI-ASSISTED DEVELOPMENT — Vibe coding, AI code editors (Cursor, Copilot, Windsurf), low-code AI builders, prompt-to-app tools, how insurers/actuaries/ops teams are building internal tools faster
2. AGENTIC AI — Multi-agent orchestration, autonomous AI workflows, agent frameworks (LangGraph, AutoGen, CrewAI), agentic RPA replacing traditional automation
3. FOUNDATION MODELS & LLMS — New model releases with enterprise relevance, fine-tuning for FS/insurance, multimodal models applied to documents/images/voice in insurance workflows
4. COPILOT-IN-EVERYTHING — Microsoft 365 Copilot, Salesforce Einstein, ServiceNow AI, SAP AI — enterprise platform AI embeds that insurers already run
5. SYNTHETIC DATA — Generation for training, privacy-preserving data sharing, regulatory acceptance, synthetic claims/policy data use cases
6. REAL-TIME DECISIONING — Streaming ML inference, event-driven architectures, real-time underwriting/fraud/pricing engines
7. MODEL RISK & AI GOVERNANCE — Model cards, audit trails, EU AI Act compliance tooling, SR 11-7 updates, bias detection, explainability in regulated contexts
8. DATA INFRASTRUCTURE — Vector databases, RAG architectures, knowledge graphs, data mesh, lakehouse patterns applied to insurance data estates
9. POST-QUANTUM CRYPTOGRAPHY — NIST PQC standards progress, migration timelines, carrier/reinsurer readiness
10. DIGITAL TWINS & SIMULATION — Physical and process twins in risk modelling, catastrophe simulation, actuarial scenario modelling
11. FEDERATED LEARNING — Privacy-preserving ML across carrier consortia, regulatory data-sharing implications
12. EDGE AI & IOT INTELLIGENCE — Telematics evolution, smart building sensors, wearables, connected vehicle data for underwriting

For EACH finding: state the broader enterprise tech development first (what is happening globally), then state the specific insurance application, implication, or risk. Cite a real, verifiable source. Be honest about readiness: most horizontal tech is Experiment or Pilot stage in insurance even if Proven elsewhere.

Return 3 findings. Use domain: "Horizontal" and subdomain from: Agentic AI | AI Dev Tooling | Foundation Models | Enterprise Copilots | Synthetic Data | Real-Time Decisioning | Model Risk & Governance | Data Infrastructure | Post-Quantum Cryptography | Digital Twins | Federated Learning | Edge AI & IoT

Return ONLY a valid JSON array: [{"title":"Vibe Coding Enters the Carrier Back Office","verdict":"WATCH","body":"AI-assisted dev tools crossing 1M enterprise seats, insurers building shadow tooling.","confidence":3,"domain":"Horizontal","subdomain":"AI Dev Tooling","experiment":"Audit one business unit for shadow AI tooling","trl":5,"regulatoryRisk":"medium","refs":[{"label":"GitHub Copilot report","url":"https://github.blog"}]}]` },
  { id:'null', name:'Null', icon:'⚔️', domain:'All', prompt:`Find 3 overhyped AI claims in insurance. Return ONLY a JSON array: [{"title":"Blockchain Claims","verdict":"NOISE","body":"No major carrier deployed blockchain claims at scale.","confidence":5,"domain":"P&C","subdomain":"Claims","experiment":"test hypothesis","trl":3,"regulatoryRisk":"low","refs":[{"label":"FCA","url":"https://www.fca.org.uk"}]}]` },
  { id:'weave', name:'Weave', icon:'🕸️', domain:'All', prompt:`Find 3 second-order AI effects in insurance. Return ONLY a JSON array: [{"title":"Synthetic Data Democratisation","verdict":"SIGNAL","body":"Synthetic data lets small carriers compete.","confidence":4,"domain":"Horizontal","subdomain":"Data","experiment":"test hypothesis","trl":6,"regulatoryRisk":"medium","refs":[{"label":"EIOPA","url":"https://www.eiopa.europa.eu"}]}]` },
  { id:'deploy', name:'Deploy', icon:'🚀', domain:'All', prompt:`Find 3 AI solutions proven at scale today. Return ONLY a JSON array: [{"title":"NLP FNOL Automation","verdict":"SIGNAL","body":"NLP automates 60-80% of FNOL intake with ROI under 18 months.","confidence":5,"domain":"P&C","subdomain":"Claims","experiment":"test hypothesis","trl":9,"regulatoryRisk":"low","refs":[{"label":"NAIC","url":"https://content.naic.org"}]}]` },
  { id:'faro', name:'Faro', icon:'🔦', domain:'All', prompt:`Find 3 emerging insurance AI signals for 18-36 months. Return ONLY a JSON array: [{"title":"Actuarial Foundation Models","verdict":"WATCH","body":"LLMs fine-tuned on actuarial data showing early promise.","confidence":3,"domain":"Life","subdomain":"Actuarial","experiment":"test hypothesis","trl":4,"regulatoryRisk":"high","refs":[{"label":"arXiv","url":"https://arxiv.org"}]}]` }
];

// ─── LIVE SOURCE FETCHER ────────────────────────────────────────────────────
async function fetchLiveSources() {
  const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
  const safeFetch = async (url, opts) => {
    try { return await Promise.race([fetch(url, opts || {}), timeout(6000)]); }
    catch(e) { return null; }
  };
  const sources = {};

  try {
    const hn = await safeFetch('https://hn.algolia.com/api/v1/search?tags=story&query=AI+insurance+enterprise&hitsPerPage=10&numericFilters=created_at_i>'+Math.floor((Date.now()-7*86400000)/1000));
    if (hn) { const d = await hn.json(); sources.hackerNews = (d.hits||[]).map(h=>`${h.title} — ${h.url||''}`).join('\n'); }
  } catch(e) { sources.hackerNews = ''; }

  try {
    const a = await safeFetch('https://export.arxiv.org/api/query?search_query=all:insurance+AND+all:machine+learning&sortBy=submittedDate&sortOrder=descending&max_results=8');
    if (a) { const xml = await a.text(); const t=[...xml.matchAll(/<title>([\s\S]*?)<\/title>/g)].slice(1).map(m=>m[1].trim()); const s=[...xml.matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map(m=>m[1].trim().substring(0,200)); sources.arxiv=t.map((ti,i)=>`${ti}: ${s[i]||''}`).join('\n'); }
  } catch(e) { sources.arxiv = ''; }

  try {
    const a2 = await safeFetch('https://export.arxiv.org/api/query?search_query=all:agentic+AI+OR+all:LLM+enterprise&sortBy=submittedDate&sortOrder=descending&max_results=6');
    if (a2) { const xml = await a2.text(); sources.arxivHorizontal=[...xml.matchAll(/<title>([\s\S]*?)<\/title>/g)].slice(1).map(m=>m[1].trim()).join('\n'); }
  } catch(e) { sources.arxivHorizontal = ''; }

  try {
    const hn2 = await safeFetch('https://hn.algolia.com/api/v1/search?tags=story&query=insurtech+underwriting+claims+AI&hitsPerPage=8&numericFilters=created_at_i>'+Math.floor((Date.now()-7*86400000)/1000));
    if (hn2) { const d = await hn2.json(); sources.hackerNewsInsurtech=(d.hits||[]).map(h=>`${h.title} — ${h.url||''}`).join('\n'); }
  } catch(e) { sources.hackerNewsInsurtech = ''; }

  try {
    const gh = await safeFetch('https://gh-trending-api.deno.dev/repositories?language=&since=weekly');
    if (gh && gh.ok) { const d = await gh.json(); sources.githubTrending=(d||[]).slice(0,10).map(r=>`${r.name}: ${r.description||''}`).join('\n'); }
  } catch(e) { sources.githubTrending = ''; }

  try {
    const a3 = await safeFetch('https://export.arxiv.org/api/query?search_query=all:climate+risk+insurance+OR+all:catastrophe+model+OR+all:parametric+insurance&sortBy=submittedDate&sortOrder=descending&max_results=6');
    if (a3) { const xml = await a3.text(); sources.arxivClimate=[...xml.matchAll(/<title>([\s\S]*?)<\/title>/g)].slice(1).map(m=>m[1].trim()).join('\n'); }
  } catch(e) { sources.arxivClimate = ''; }

  try {
    const a4 = await safeFetch('https://export.arxiv.org/api/query?search_query=all:longevity+risk+OR+all:actuarial+machine+learning+OR+all:mortality+prediction&sortBy=submittedDate&sortOrder=descending&max_results=6');
    if (a4) { const xml = await a4.text(); sources.arxivLife=[...xml.matchAll(/<title>([\s\S]*?)<\/title>/g)].slice(1).map(m=>m[1].trim()).join('\n'); }
  } catch(e) { sources.arxivLife = ''; }

  try {
    const hn3 = await safeFetch('https://hn.algolia.com/api/v1/search?tags=story&query=post+quantum+cryptography+OR+AI+governance+OR+model+risk&hitsPerPage=6&numericFilters=created_at_i>'+Math.floor((Date.now()-14*86400000)/1000));
    if (hn3) { const d = await hn3.json(); sources.hackerNewsSecurity=(d.hits||[]).map(h=>h.title).join('\n'); }
  } catch(e) { sources.hackerNewsSecurity = ''; }

  return sources;
}

function buildSourceContext(mindId, sources) {
  const blocks = [];
  if (sources.hackerNews) blocks.push(`=== LIVE: Hacker News AI/Enterprise Stories This Week ===\n${sources.hackerNews}`);
  if (['scout','deploy','null','weave'].includes(mindId) && sources.hackerNewsInsurtech) blocks.push(`=== LIVE: InsurTech/Claims/Underwriting News ===\n${sources.hackerNewsInsurtech}`);
  if (['atlas'].includes(mindId) && sources.arxivClimate) blocks.push(`=== LIVE: Recent Climate/Cat/Parametric Research Papers ===\n${sources.arxivClimate}`);
  if (['vita'].includes(mindId) && sources.arxivLife) blocks.push(`=== LIVE: Recent Longevity/Actuarial AI Research Papers ===\n${sources.arxivLife}`);
  if (['prism','faro'].includes(mindId)) {
    if (sources.arxivHorizontal) blocks.push(`=== LIVE: Agentic AI / LLM Research Papers ===\n${sources.arxivHorizontal}`);
    if (sources.githubTrending) blocks.push(`=== LIVE: GitHub Trending Repos This Week ===\n${sources.githubTrending}`);
    if (sources.hackerNewsSecurity) blocks.push(`=== LIVE: Security/Governance/PQC News ===\n${sources.hackerNewsSecurity}`);
  }
  if (['scout','vita','atlas','prism'].includes(mindId) && sources.arxiv) blocks.push(`=== LIVE: Recent Insurance + ML Research Papers ===\n${sources.arxiv}`);
  if (blocks.length === 0) return '';
  return '\n\n' + blocks.join('\n\n') + '\n\nUsing the above LIVE sources as your primary evidence base, identify the most significant findings. Prioritise findings where you can cite one of these real sources. If a source is not relevant to your domain, ignore it.';
}
// ─── END LIVE SOURCES ───────────────────────────────────────────────────────

async function supabaseCall(method, table, body, query) {
  query = query || '';
  const url = SUPABASE_URL + '/rest/v1/' + table + query;
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY
  };
  if (method === 'POST') headers['Prefer'] = 'return=representation';
  const opts = { method: method, headers: headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) throw new Error('Supabase ' + res.status + ': ' + text);
  return text ? JSON.parse(text) : null;
}

async function callMind(mind, liveSources) {
  const userContent = mind.prompt + buildSourceContext(mind.id, liveSources || {});
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1800,
      system: 'Respond ONLY with a valid JSON array. No markdown. Start with [ end with ].',
      messages: [{ role: 'user', content: userContent }]
    })
  });
  if (!res.ok) throw new Error('Anthropic ' + res.status);
  const data = await res.json();
  const raw = data.content.map(function(c) { return c.text || ''; }).join('');
  var parsed;
  try { parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()); }
  catch(e) {
    var m = raw.match(/\[[\s\S]*\]/);
    if (!m) throw new Error('parse fail for ' + mind.id);
    parsed = JSON.parse(m[0]);
  }
  return parsed.map(function(f) {
    f.mind_id = mind.id;
    f.mind_name = mind.name;
    f.mind_icon = mind.icon;
    return f;
  });
}

module.exports = async function handler(req, res) {
  var auth = req.headers['authorization'] || '';
  if (auth !== 'Bearer ' + CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await supabaseCall('GET', 'findings', null, '?limit=1');
  } catch(err) {
    return res.status(500).json({
      error: 'Supabase connection failed',
      details: err.message,
      url_set: !!SUPABASE_URL,
      key_set: !!SUPABASE_KEY
    });
  }

  var runDate = new Date().toISOString().split('T')[0];
  var runId = 'run_' + Date.now();
  var allFindings = [];
  var errors = [];

  // Fetch live sources once per run — shared across all minds
  console.log('[YNOT] Fetching live data sources...');
  var liveSources = await fetchLiveSources();
  console.log('[YNOT] Live sources fetched:', Object.keys(liveSources).filter(function(k){return liveSources[k];}).join(', '));

  var outcomes = await Promise.allSettled(MINDS.map(function(m) { return callMind(m, liveSources); }));
  outcomes.forEach(function(o, i) {
    if (o.status === 'fulfilled') allFindings = allFindings.concat(o.value);
    else errors.push({ mind: MINDS[i].id, error: o.reason && o.reason.message });
  });

  if (allFindings.length === 0) {
    return res.status(500).json({ error: 'All minds failed', errors: errors });
  }

  var rows = allFindings.map(function(f) {
    return {
      run_id: runId, run_date: runDate,
      mind_id: f.mind_id, mind_name: f.mind_name, mind_icon: f.mind_icon,
      title: f.title, verdict: normalizeVerdict(f.verdict), body: f.body || f.description || f.summary || 'No body provided',
      domain: f.domain, subdomain: f.subdomain || null,
      confidence: Math.min(5, Math.max(1, parseInt(f.confidence) || 3)), trl: f.trl || 5,
      regulatory_risk: normalizeRisk(f.regulatoryRisk),
      experiment: f.experiment || null, refs: f.refs || []
    };
  });

  try {
    await supabaseCall('POST', 'findings', rows);
    console.log('[YNOT] Run complete. Sources used: arxiv='+!!liveSources.arxiv+', hn='+!!liveSources.hackerNews+', github='+!!liveSources.githubTrending+', climate='+!!liveSources.arxivClimate+', life='+!!liveSources.arxivLife);
  } catch(err) {
    return res.status(500).json({ error: 'Storage failed', details: err.message });
  }

  return res.status(200).json({
    success: true,
    run_id: runId,
    findings_count: allFindings.length,
    errors: errors
  });
};





