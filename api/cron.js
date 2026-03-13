'use strict';
var ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY || '';
var SUPABASE_URL  = process.env.SUPABASE_URL  || '';
var SUPABASE_KEY  = process.env.SUPABASE_KEY  || process.env.SUPABASE_SERVICE_KEY || '';
var CRON_SECRET   = process.env.CRON_SECRET   || 'ynot-secret-2025';
var TAVILY_KEY    = process.env.TAVILY_API_KEY || '';
var CLAUDE_MODEL  = 'claude-sonnet-4-20250514';

// ── SOURCE GOVERNANCE ──────────────────────────────────────────────────────
// Edit data/sources.json to update domain lists — no cron code changes needed.
var SOURCES = (function() {
  try { return require('../data/sources.json'); }
  catch(e) { return { exclude_always: [], authority_tlds: ['.gov','.edu','.ac.uk','.org','.int'], trusted_seeds: {} }; }
})();

function isSuspectDomain(url) {
  try {
    var host = new URL(url).hostname.replace('www.', '');
    return (SOURCES.exclude_always || []).some(function(d) {
      return host === d || host.endsWith('.' + d);
    });
  } catch(e) { return false; }
}

function isAuthorityDomain(domain) {
  var tlds = SOURCES.authority_tlds || ['.gov','.edu','.ac.uk','.org','.int'];
  if (tlds.some(function(t) { return domain.endsWith(t); })) return true;
  return Object.values(SOURCES.trusted_seeds || {}).some(function(arr) {
    return arr.indexOf(domain) !== -1;
  });
}

// ── AGENT DEFINITIONS ──────────────────────────────────────────────────────
var MINDS = [
  {
    id: 'scout', name: 'Scout', icon: 'Scout', domain: 'P&C',
    brief: 'You are Scout, a specialist in P&C insurance AI. Your job is to find the most significant AI developments in property and casualty insurance: fraud detection, underwriting automation, claims processing, telematics, catastrophe modelling. You have memory of what you found in previous weeks — use it to track signal evolution and avoid repeating old findings.',
    querySeeds: [
      'AI fraud detection insurance 2026',
      'P&C underwriting automation machine learning',
      'claims AI automation property casualty',
      'telematics AI underwriting 2026',
      'insurance carrier AI production deployment case study 2026',
      'AI P&C insurance Japan APAC 2026'
    ]
  },
  {
    id: 'vita', name: 'Vita', icon: 'Vita', domain: 'Life',
    brief: 'You are Vita, a specialist in Life insurance, Annuities, and Retirement AI. Find the most significant AI developments in life insurance, annuity products, retirement income planning, and longevity risk: mortality prediction, personalised life underwriting, wearables for life insurance, actuarial ML, retirement AI. DO NOT include health insurance, pharmacy benefits, hospital systems, or healthcare IT (e.g. Optum, Epic, payers, providers, hospital claims). You have memory of what you found in previous weeks — use it to track signal evolution and avoid repeating old findings.',
    querySeeds: [
      'life insurance AI underwriting 2026',
      'annuity retirement income AI machine learning',
      'longevity risk mortality prediction actuarial ML',
      'wearables life insurance underwriting data',
      'life insurance AI deployment CIO carrier earnings 2026',
      'life insurance AI India emerging market 2026'
    ]
  },
  {
    id: 'lex', name: 'Lex', icon: 'Lex', domain: 'Regulation',
    brief: 'You are Lex, a specialist in insurance AI regulation. Find the most significant regulatory developments affecting AI in insurance: FCA, EIOPA, NAIC, EU AI Act, IAIS, model risk governance, explainability requirements. You have memory of what you found in previous weeks — use it to track regulatory signal evolution.',
    querySeeds: [
      'FCA AI insurance regulation 2026',
      'EU AI Act insurance compliance',
      'EIOPA digital transformation insurance',
      'NAIC AI model risk governance explainability',
      'MAS Singapore AI insurance regulation 2026',
      'DORA EU AI Act EIOPA divergence insurance 2026'
    ]
  },
  {
    id: 'terra', name: 'Terra', icon: 'Terra', domain: 'Climate',
    brief: 'You are Terra, a specialist in climate risk and ESG for insurance. Find the most significant AI and data science developments in climate risk modelling, parametric insurance, ESG underwriting, and catastrophe prediction. You have memory of what you found in previous weeks — use it to track signal evolution.',
    querySeeds: [
      'climate risk AI insurance 2026',
      'parametric insurance AI machine learning',
      'ESG underwriting data analytics',
      'catastrophe prediction AI model flood',
      'climate parametric insurance APAC emerging market 2026'
    ]
  },
  {
    id: 'horizon', name: 'Horizon', icon: 'Horizon', domain: 'Horizontal',
    brief: 'You are Horizon, a specialist in horizontal enterprise AI with insurance implications. Find the most significant developments in foundation models, agentic AI, synthetic data, federated learning, post-quantum cryptography, and real-time decisioning that will impact insurance carriers. You have memory of what you found in previous weeks — use it to track signal evolution.',
    querySeeds: [
      'agentic AI enterprise insurance 2026',
      'foundation model insurance applications',
      'synthetic data insurance privacy federated learning',
      'post-quantum cryptography financial services insurance',
      'AI insurance patent filing USPTO machine learning 2026',
      'AI financial services regulation Singapore MAS 2026'
    ]
  }
];

// ── HELPERS ────────────────────────────────────────────────────────────────
function normalizeVerdict(v) {
  var u = String(v || '').toUpperCase();
  if (u === 'SIGNAL') return 'SIGNAL';
  if (u === 'NOISE') return 'NOISE';
  return 'WATCH';
}
function normalizeRisk(r) {
  var l = String(r || '').toLowerCase();
  if (l === 'low') return 'low';
  if (l === 'high') return 'high';
  return 'medium';
}

async function supabaseCall(method, table, body, query) {
  var url = SUPABASE_URL + '/rest/v1/' + table + (query || '');
  var opts = {
    method: method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer': method === 'POST' ? 'return=minimal' : ''
    }
  };
  if (body) opts.body = JSON.stringify(body);
  var r = await fetch(url, opts);
  if (!r.ok) {
    var t = await r.text().catch(function() { return ''; });
    throw new Error('Supabase ' + method + ' ' + table + ' ' + r.status + ': ' + t);
  }
  if (method === 'GET') return r.json();
  return null;
}

async function tavilySearch(query, maxResults) {
  try {
    var r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TAVILY_KEY },
      body: JSON.stringify({
        query: query,
        search_depth: 'advanced',
        max_results: maxResults || 5,
        include_answer: false,
        include_raw_content: false,
        exclude_domains: SOURCES.exclude_always || []
      })
    });
    if (!r.ok) { console.warn('[YNOT] Tavily ' + r.status + ' for: ' + query); return []; }
    var data = await r.json();
    return (data.results || []).map(function(item) {
      return {
        title: item.title || '',
        url: item.url || '',
        content: String(item.content || item.snippet || '').substring(0, 400),
        published_date: item.published_date || null
      };
    });
  } catch(e) { console.warn('[YNOT] Tavily error: ' + e.message); return []; }
}

async function claudeCall(system, user, maxTokens) {
  var r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens || 1200,
      system: system,
      messages: [{ role: 'user', content: user }]
    })
  });
  if (!r.ok) {
    var t = await r.text().catch(function() { return ''; });
    throw new Error('Claude ' + r.status + ': ' + t);
  }
  var data = await r.json();
  return data.content[0].text.trim();
}

// ── AGENT MEMORY: fetch last 4 weeks of findings for this agent ────────────
async function fetchAgentMemory(mindId) {
  try {
    var fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    var data = await supabaseCall('GET', 'findings', null,
      '?mind_id=eq.' + mindId +
      '&run_date=gte.' + fourWeeksAgo +
      '&order=run_date.desc' +
      '&select=title,verdict,confidence,run_date,trl' +
      '&limit=20'
    );
    if (!data || data.length === 0) return null;
    var byWeek = {};
    data.forEach(function(f) {
      if (!byWeek[f.run_date]) byWeek[f.run_date] = [];
      byWeek[f.run_date].push(f.title + ' [' + f.verdict + ', confidence ' + f.confidence + ', TRL ' + f.trl + ']');
    });
    return Object.keys(byWeek).sort().reverse().map(function(date) {
      return 'Week of ' + date + ':\n' + byWeek[date].join('\n');
    }).join('\n\n');
  } catch(e) {
    console.warn('[YNOT] Memory fetch failed for ' + mindId + ': ' + e.message);
    return null;
  }
}

// ── URL VERIFICATION: HEAD-check refs, remove dead links ──────────────────
async function verifyRefs(refs) {
  if (!refs || refs.length === 0) return refs;
  var verified = await Promise.all(refs.map(async function(ref) {
    if (!ref.url || !ref.url.startsWith('http')) return null;
    if (isSuspectDomain(ref.url)) return null; // strip excluded domains even if cited by Claude
    try {
      var controller = new AbortController();
      var tid = setTimeout(function() { controller.abort(); }, 4000);
      var r = await fetch(ref.url, { method: 'HEAD', signal: controller.signal, redirect: 'follow' });
      clearTimeout(tid);
      if (r.ok) return ref;
      // Try GET as fallback (some servers reject HEAD)
      var c2 = new AbortController();
      var tid2 = setTimeout(function() { c2.abort(); }, 4000);
      var r2 = await fetch(ref.url, { method: 'GET', signal: c2.signal, redirect: 'follow' });
      clearTimeout(tid2);
      return r2.ok ? ref : null;
    } catch(e) { return null; }
  }));
  var live = verified.filter(Boolean);
  return live.length > 0 ? live : refs; // keep originals if all dead (better than empty)
}

// ── SOURCE REPUTATION: record which domains produced quality findings ──────
async function recordSourceReputation(findings) {
  try {
    // Only SIGNAL findings count for reputation (not WATCH — higher bar)
    var signals = findings.filter(function(f) { return f.verdict === 'SIGNAL' && f.confidence >= 4; });
    if (signals.length === 0) return;
    var domains = {};
    var agentId = findings[0] && findings[0].mind_id;
    signals.forEach(function(f) {
      (f.refs || []).forEach(function(ref) {
        if (!ref.url) return;
        try {
          var d = new URL(ref.url).hostname.replace('www.', '');
          if (!isSuspectDomain(ref.url)) domains[d] = (domains[d] || 0) + 1;
        } catch(e) {}
      });
    });
    var today = new Date().toISOString().split('T')[0];
    var rows = Object.keys(domains).map(function(d) {
      return { domain: d, mention_count: domains[d], last_seen: today, agent_names: [agentId] };
    });
    if (rows.length > 0) {
      // Upsert: merge-duplicates increments mention_count via PostgREST on_conflict
      var url = SUPABASE_URL + '/rest/v1/source_reputation';
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(rows)
      }).catch(function(e) { console.warn('[YNOT] source_reputation upsert failed: ' + e.message); });
      // Surface new authoritative candidates for next week's include list
      await proposeNewSources(Object.keys(domains)).catch(function(e) {
        console.warn('[YNOT] proposeNewSources failed: ' + e.message);
      });
    }
  } catch(e) {
    console.warn('[YNOT] Source reputation recording failed: ' + e.message);
  }
}

// ── PROPOSED SOURCES: surface high-signal domains for auto-promotion ───────
async function proposeNewSources(domains) {
  var excludeList = SOURCES.exclude_always || [];
  var threshold = SOURCES.auto_promote_threshold || 5;
  // Fetch current reputation counts for these domains
  var domainFilter = domains.map(function(d) { return 'domain.eq.' + d; }).join(',');
  var existing = await supabaseCall('GET', 'source_reputation', null,
    '?or=(' + domainFilter + ')&select=domain,mention_count').catch(function() { return []; });
  var candidates = (existing || []).filter(function(row) {
    return row.mention_count >= threshold &&
      !excludeList.includes(row.domain) &&
      isAuthorityDomain(row.domain);
  });
  if (candidates.length === 0) return;
  var today = new Date().toISOString().split('T')[0];
  var rows = candidates.map(function(c) {
    return { domain: c.domain, hit_count: c.mention_count, first_seen: today, status: 'pending' };
  });
  var url = SUPABASE_URL + '/rest/v1/proposed_sources';
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer': 'resolution=ignore-duplicates,return=minimal'
    },
    body: JSON.stringify(rows)
  }).catch(function(e) { console.warn('[YNOT] proposed_sources insert failed: ' + e.message); });
}

// ── QUERY GENERATION (with memory context) ────────────────────────────────
async function generateQueries(mind, memory) {
  var memorySection = memory
    ? '\n\nYour findings from the last 4 weeks (do not repeat these — find what is NEW this week):\n' + memory
    : '\n\nThis is your first run — no prior memory.';
  var system = 'You are ' + mind.name + ', an autonomous AI research agent. ' + mind.brief +
    ' Generate exactly 4 specific, targeted web search queries to find the most relevant and RECENT developments in your domain this week. Return ONLY a JSON array of 4 strings, no other text.';
  var user = 'Generate your 4 search queries for this week. Focus on what is most likely to have changed or emerged in the last 7 days. Seed topics (make them more specific and current): ' +
    mind.querySeeds.join(', ') + memorySection;
  try {
    var raw = await claudeCall(system, user, 300);
    var match = raw.match(/\[[\s\S]*?\]/);
    if (!match) throw new Error('no JSON array');
    var queries = JSON.parse(match[0]);
    if (!Array.isArray(queries) || queries.length === 0) throw new Error('empty');
    return queries.slice(0, 4).map(function(q) { return String(q); });
  } catch(e) {
    console.warn('[YNOT] ' + mind.name + ' query gen failed: ' + e.message + ' - using seeds');
    return mind.querySeeds.slice(0, 4);
  }
}

async function fetchAgentResults(queries) {
  var allResults = await Promise.all(queries.map(function(q) { return tavilySearch(q, 4); }));
  var seen = {}; var deduped = [];
  allResults.forEach(function(results) {
    results.forEach(function(item) {
      if (item.url && !seen[item.url]) { seen[item.url] = true; deduped.push(item); }
    });
  });
  return deduped;
}

// ── ANALYSIS (with memory context, freshness metadata, signal_status) ─────
async function analyseResults(mind, queries, results, memory) {
  var resultsText = results.slice(0, 12).map(function(r, i) {
    var pub = r.published_date ? ' [published: ' + r.published_date + ']' : '';
    return '[' + (i + 1) + '] ' + r.title + pub + '\nURL: ' + r.url + '\n' + r.content;
  }).join('\n\n');
  var memorySection = memory
    ? '\n\nYour findings from the last 4 weeks (for context — do not repeat these, find what is NEW):\n' + memory
    : '';
  var system = 'You are ' + mind.name + ', an autonomous AI research agent. ' + mind.brief +
    ' You have searched the web using your own queries and received real live results. ' +
    'Analyse what you actually found and extract the most significant findings. ' +
    'Be honest: if evidence is weak, reflect that in verdict and confidence. ' +
    'Use real URLs from the search results as your refs — copy them exactly. NEVER invent URLs. ' +
    'IMPORTANT: Do not reproduce or quote source content verbatim. All finding bodies must be your own ' +
    'independent synthesis and analysis — describe what is understood, not what a source says word for word. ' +
    'Strongly prefer authoritative primary sources: regulatory filings, peer-reviewed papers, academic preprints (arXiv), ' +
    'actuarial bodies (SOA, CAS), and official government or regulator sites. ' +
    'If only weak sources (vendor blogs, news summaries, analyst reports) are available, set confidence to 1-2. ' +
    'Return ONLY a valid JSON array of 3-5 findings. ' +
    'Each finding must have: title (string), verdict ("SIGNAL"|"WATCH"|"NOISE"), ' +
    'body (2-3 sentences: what it is and what is currently understood about it in the insurance context — describe factually, do not prescribe or recommend), ' +
    'confidence (1-5 integer), domain (string), subdomain (string), ' +
    'trl (1-9 integer), regulatoryRisk ("low"|"medium"|"high"), ' +
    'experiment (a research question or learning hypothesis worth exploring further — frame as curiosity, not a recommendation or action item), ' +
    'refs (array of {label, url} using real URLs from results), ' +
    'signal_status ("NEW"|"EMERGING"|"CONFIRMED"|"RECURRING") — NEW if first time seeing this topic, ' +
    'EMERGING if seen once before, CONFIRMED if seen 2+ times, RECURRING if it has appeared every week.';
  var user = 'Your search queries this week:\n' + queries.map(function(q, i) { return (i + 1) + '. ' + q; }).join('\n') +
    '\n\nLive web results:\n\n' + resultsText + memorySection +
    '\n\nProduce your findings. Return only the JSON array.';
  try {
    var raw = await claudeCall(system, user, 1800);
    var match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('no JSON array');
    var findings = JSON.parse(match[0]);
    if (!Array.isArray(findings)) throw new Error('not array');
    // Verify refs and attach metadata
    var enriched = await Promise.all(findings.map(async function(f) {
      var verifiedRefs = await verifyRefs(f.refs || []);
      return Object.assign({}, f, {
        mind_id: mind.id,
        mind_name: mind.name,
        mind_icon: mind.icon,
        refs: verifiedRefs,
        search_queries: queries,
        signal_status: f.signal_status || 'NEW'
      });
    }));
    return enriched;
  } catch(e) {
    console.error('[YNOT] ' + mind.name + ' analysis failed: ' + e.message);
    return [];
  }
}

async function runAgent(mind) {
  console.log('[YNOT] ' + mind.name + ': loading memory...');
  var memory = await fetchAgentMemory(mind.id);
  console.log('[YNOT] ' + mind.name + ': ' + (memory ? 'memory loaded' : 'no prior memory'));
  console.log('[YNOT] ' + mind.name + ': generating queries...');
  var queries = await generateQueries(mind, memory);
  console.log('[YNOT] ' + mind.name + ': queries: ' + queries.join(' | '));
  var results = await fetchAgentResults(queries);
  console.log('[YNOT] ' + mind.name + ': ' + results.length + ' unique results from Tavily');
  if (results.length === 0) { console.warn('[YNOT] ' + mind.name + ': no results, skipping'); return []; }
  var findings = await analyseResults(mind, queries, results, memory);
  console.log('[YNOT] ' + mind.name + ': ' + findings.length + ' findings (refs verified)');
  await recordSourceReputation(findings);
  return findings;
}

// ── WEEKLY DIGEST ─────────────────────────────────────────────────────────
async function generateWeeklyDigest(findings, runDate) {
  var signals = findings.filter(function(f) { return f.verdict === 'SIGNAL'; });
  var watches  = findings.filter(function(f) { return f.verdict === 'WATCH'; });
  var noises   = findings.filter(function(f) { return f.verdict === 'NOISE'; });
  var top = signals.slice(0, 5).concat(watches.slice(0, 3));
  var findingsText = top.map(function(f) {
    return f.title + ' [' + f.verdict + ', TRL ' + (f.trl || '?') + ', ' + f.domain + ', ' + (f.signal_status || 'NEW') + ']: ' + String(f.body || '').substring(0, 200);
  }).join('\n');
  var prompt = 'Week of ' + runDate + '. Five autonomous agents independently searched the web this week using self-generated queries. ' +
    'Total findings: ' + findings.length + ' (' + signals.length + ' Signals, ' + watches.length + ' Watch, ' + noises.length + ' Noise).\n\n' +
    'Top findings:\n' + findingsText + '\n\n' +
    'Write an educational intelligence briefing for anyone curious about AI in insurance — practitioners, students, researchers, and leaders alike. Format EXACTLY:\n\n' +
    '[HOOK] One specific, concrete, slightly surprising sentence from a real finding. No cliches.\n\n' +
    '[CONTEXT] 1-2 sentences on what the agents found and what it reveals about how AI in insurance is evolving. Mention agent count and finding counts naturally.\n\n' +
    '-> [Finding title] - [One sharp sentence: what was found and what it reveals about the state of AI in insurance]\n' +
    '-> [Finding title] - [One sharp sentence]\n' +
    '-> [Finding title] - [One sharp sentence]\n\n' +
    '[CLOSE] One observational sentence on what is worth following or learning more about. No "In conclusion". No "The future is...".\n\n' +
    'All findings this week -> ynot.now\n\n' +
    '#InsurTech #AIinInsurance #Insurance #Innovation\n\n' +
    'Banned words: leverage, landscape, transformative, game-changer, revolutionise, unlock, harness, delve, cutting-edge, unprecedented, seamless. Vary sentence length. Inform, do not advise.';
  return claudeCall(
    'You write evidence-grounded intelligence briefings for anyone curious about AI in insurance — practitioners, students, and researchers. Your job is to inform and spark curiosity, not to advise or recommend. Sound like a well-read, curious observer. Use specific numbers and named technologies. Never use corporate filler.',
    prompt, 600
  );
}

async function saveWeeklyDigest(allFindings, runId, runDate) {
  console.log('[YNOT] Generating weekly digest...');
  var postText = await generateWeeklyDigest(allFindings, runDate);
  await supabaseCall('DELETE', 'weekly_posts', null, '?run_date=eq.' + runDate).catch(function() {});
  await supabaseCall('POST', 'weekly_posts', [{ run_id: runId, run_date: runDate, post_text: postText, status: 'ready' }]);
  console.log('[YNOT] Weekly digest saved.');
  return postText;
}

// ── HANDLER ───────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  var auth = req.headers['authorization'] || '';
  var isExternalCall = auth.length > 0;
  if (isExternalCall && auth !== 'Bearer ' + CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!TAVILY_KEY) { return res.status(500).json({ error: 'TAVILY_API_KEY not configured' }); }
  try { await supabaseCall('GET', 'findings', null, '?limit=1'); }
  catch(err) { return res.status(500).json({ error: 'Supabase connection failed', details: err.message }); }

  var runDate = new Date().toISOString().split('T')[0];
  var runId = 'run_' + Date.now();
  var allFindings = []; var errors = [];

  console.log('[YNOT] Phase 1: 5 primary agents running with memory + Tavily + URL verification...');
  var outcomes = await Promise.allSettled(MINDS.map(function(m) { return runAgent(m); }));
  outcomes.forEach(function(o, i) {
    if (o.status === 'fulfilled') allFindings = allFindings.concat(o.value);
    else errors.push({ mind: MINDS[i].id, error: o.reason && o.reason.message });
  });

  if (allFindings.length === 0) {
    return res.status(500).json({ error: 'All agents failed', errors: errors });
  }

  var rows = allFindings.map(function(f) {
    return {
      run_id: runId,
      run_date: runDate,
      mind_id: f.mind_id,
      mind_name: f.mind_name,
      mind_icon: f.mind_icon,
      title: f.title,
      verdict: normalizeVerdict(f.verdict),
      body: f.body || f.description || 'No body provided',
      domain: f.domain,
      subdomain: f.subdomain || null,
      confidence: Math.min(5, Math.max(1, parseInt(f.confidence) || 3)),
      trl: f.trl || 5,
      regulatory_risk: normalizeRisk(f.regulatoryRisk || f.regulatory_risk),
      experiment: f.experiment || null,
      refs: f.refs || [],
      search_queries: f.search_queries || [],
      signal_status: f.signal_status || 'NEW'
    };
  });

  try {
    await supabaseCall('POST', 'findings', rows);
    console.log('[YNOT] Phase 1 complete: ' + allFindings.length + ' findings stored. run_id=' + runId);
  } catch(err) {
    return res.status(500).json({ error: 'Storage failed', details: err.message });
  }

  var digestStatus = 'skipped';
  try { await saveWeeklyDigest(allFindings, runId, runDate); digestStatus = 'ready'; }
  catch(dErr) { console.error('[YNOT] Digest failed:', dErr.message); digestStatus = 'error: ' + dErr.message; }

  return res.status(200).json({
    success: true, phase: 1, run_id: runId, run_date: runDate,
    findings_count: allFindings.length, digest: digestStatus, errors: errors,
    note: 'Phase 2 synthesis (Null, Weave, Faro) runs at 06:02 UTC via cron-synthesise.js'
  });
};
