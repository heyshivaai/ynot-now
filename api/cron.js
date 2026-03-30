'use strict';
var ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY || '';
var SUPABASE_URL  = process.env.SUPABASE_URL  || '';
var SUPABASE_KEY  = process.env.SUPABASE_KEY  || process.env.SUPABASE_SERVICE_KEY || '';
var CRON_SECRET   = process.env.CRON_SECRET   || 'ynot-secret-2025';
var TAVILY_KEY    = process.env.TAVILY_API_KEY || '';
var CLAUDE_MODEL  = 'claude-sonnet-4-20250514';

// ── AGENT DEFINITIONS ──────────────────────────────────────────────────────
var MINDS = [
  {
    id: 'scout', name: 'Scout', icon: 'Scout', domain: 'P&C',
    brief: 'You are Scout, a specialist in P&C insurance AI. Your job is to find the most significant AI developments in property and casualty insurance: fraud detection, underwriting automation, claims processing, telematics, catastrophe modelling. You have memory of what you found in previous weeks — use it to track signal evolution and avoid repeating old findings.',
    querySeeds: ['AI fraud detection insurance 2026','P&C underwriting automation machine learning','claims AI automation property casualty','telematics AI underwriting 2026','insurance patent filing AI claims automation','Artemis catastrophe bond insurtech']
  },
  {
    id: 'vita', name: 'Vita', icon: 'Vita', domain: 'Life',
    brief: 'You are Vita, a specialist in Life insurance, Annuities, and Retirement AI. Find the most significant AI developments in life insurance, annuity products, retirement income planning, and longevity risk: mortality prediction, personalised life underwriting, wearables for life insurance, actuarial ML, retirement AI. DO NOT include health insurance, pharmacy benefits, hospital systems, or healthcare IT (e.g. Optum, Epic, payers, providers, hospital claims). You have memory of what you found in previous weeks — use it to track signal evolution and avoid repeating old findings.',
    querySeeds: ['life insurance AI underwriting 2026','annuity retirement income AI machine learning','longevity risk mortality prediction actuarial ML','wearables life insurance underwriting data','SEC earnings call insurance AI deployment','AM Best insurance AI investment']
  },
  {
    id: 'lex', name: 'Lex', icon: 'Lex', domain: 'Regulation',
    brief: 'You are Lex, a specialist in insurance AI regulation. Find the most significant regulatory developments affecting AI in insurance: FCA, EIOPA, NAIC, EU AI Act, IAIS, model risk governance, explainability requirements. You have memory of what you found in previous weeks — use it to track regulatory signal evolution.',
    querySeeds: ['FCA AI insurance regulation 2026','EU AI Act insurance compliance','EIOPA digital transformation insurance','NAIC AI model risk governance explainability','regulatory sandbox insurance AI fintech 2026','Singapore MAS Hong Kong HKIA insurance AI']
  },
  {
    id: 'terra', name: 'Terra', icon: 'Terra', domain: 'Climate',
    brief: 'You are Terra, a specialist in climate risk and ESG for insurance. Find the most significant AI and data science developments in climate risk modelling, parametric insurance, ESG underwriting, and catastrophe prediction. You have memory of what you found in previous weeks — use it to track signal evolution.',
    querySeeds: ['climate risk AI insurance 2026','parametric insurance AI machine learning','ESG underwriting data analytics','catastrophe prediction AI model flood','Artemis ILS catastrophe bond AI','Google Patents climate risk insurance model']
  },
  {
    id: 'horizon', name: 'Horizon', icon: 'Horizon', domain: 'Horizontal',
    brief: 'You are Horizon, a specialist in horizontal enterprise AI with insurance implications. Find the most significant developments in foundation models, agentic AI, synthetic data, federated learning, post-quantum cryptography, and real-time decisioning that will impact insurance carriers. You have memory of what you found in previous weeks — use it to track signal evolution.',
    querySeeds: ['agentic AI enterprise insurance 2026','foundation model insurance applications','synthetic data insurance privacy federated learning','post-quantum cryptography financial services insurance','GitHub trending AI insurance actuarial repository','conference InsurTech Connect ITC AI speaker']
  }
];

// ── HELPERS ────────────────────────────────────────────────────────────────
function normalizeVerdict(v) {
  var u = String(v || '').toUpperCase();
  if (u === 'SIGNAL') return 'SIGNAL';
  if (u === 'UNVERIFIED') return 'UNVERIFIED';
  if (u === 'NOISE') return 'UNVERIFIED'; // Legacy support: map old NOISE to UNVERIFIED
  return 'WATCH';
}
function normalizeRisk(r) {
  var l = String(r || '').toLowerCase();
  if (l === 'low') return 'low';
  if (l === 'high') return 'high';
  return 'medium';
}

// ── VENDOR-NEUTRAL FILTER (hard programmatic safety net) ─────────────────
var VENDOR_NAMES = [
  'accenture','deloitte','mckinsey','ey ','ernst young','ernst & young','pwc','pricewaterhousecoopers','kpmg',
  'bain ','bcg','boston consulting','capgemini','cognizant','infosys','wipro','tcs','tata consultancy',
  'guidewire','duck creek','majesco','sapiens','unqork','socotra','earnix','shift technology',
  'verisk','lexisnexis','moody','cape analytics','tractable','lemonade','hippo insurance','root insurance',
  'microsoft','google','amazon','aws','ibm','oracle','salesforce','palantir','snowflake','databricks',
  'openai','anthropic','meta ','nvidia','tesla'
];
function isVendorCentricTitle(title) {
  var lower = String(title || '').toLowerCase();
  for (var i = 0; i < VENDOR_NAMES.length; i++) {
    var v = VENDOR_NAMES[i].trim();
    // Check if title STARTS with the vendor name
    if (lower.indexOf(v) === 0) return v;
    // Check patterns like "Vendor launches...", "Vendor's new..."
    var actions = ['launches','announces','unveils','releases','partners','introduces',
      'expands','acquires','rolls out','deploys','reports','predicts','projects'];
    for (var j = 0; j < actions.length; j++) {
      if (lower.indexOf(v + ' ' + actions[j]) !== -1) return v;
    }
    if (lower.indexOf(v + "'s ") !== -1 && lower.indexOf(v + "'s ") < 3) return v;
  }
  return null;
}
function applyVendorFilter(findings) {
  return findings.filter(function(f) {
    var vendor = isVendorCentricTitle(f.title);
    if (vendor) {
      console.warn('[YNOT] VENDOR FILTER: blocked finding "' + f.title + '" (vendor-centric: ' + vendor + ')');
      return false;
    }
    return true;
  });
}

// Extract date from URL patterns like /2026/03/23/ or /2026-03-23/ or /20260323/
function extractDateFromUrl(url) {
  if (!url) return null;
  try {
    // Pattern 1: /YYYY/MM/DD/ or /YYYY-MM-DD/
    var match = url.match(/\/(\d{4})[\/-](\d{2})[\/-](\d{2})/);
    if (match) {
      var dateStr = match[1] + '-' + match[2] + '-' + match[3];
      var d = new Date(dateStr);
      if (!isNaN(d.getTime())) return dateStr;
    }
    // Pattern 2: /YYYYMMDD/ (8 digits together)
    match = url.match(/\/(\d{4})(\d{2})(\d{2})\//);
    if (match) {
      var dateStr = match[1] + '-' + match[2] + '-' + match[3];
      var d = new Date(dateStr);
      if (!isNaN(d.getTime())) return dateStr;
    }
    // Pattern 3: month names like /march-2026/ or /2026/march/
    var months = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
    match = url.toLowerCase().match(/\/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\/-](\d{4})/);
    if (match) return match[2] + '-' + months[match[1]] + '-01';
    match = url.toLowerCase().match(/\/(\d{4})[\/-](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/);
    if (match) return match[1] + '-' + months[match[2]] + '-01';
  } catch(e) {}
  return null;
}

// Check if a date string is within the last N days
function isWithinDays(dateStr, days) {
  if (!dateStr) return false;
  try {
    var d = new Date(dateStr);
    var cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    return d.getTime() >= cutoff;
  } catch(e) { return false; }
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
        search_depth: 'basic',
        max_results: maxResults || 5,
        days: 7,  // LAYER 1: Only fetch results from last 7 days
        include_answer: false,
        include_raw_content: false
      })
    });
    if (!r.ok) { console.warn('[YNOT] Tavily ' + r.status + ' for: ' + query); return []; }
    var data = await r.json();
    return (data.results || []).map(function(item) {
      // Try to extract date from URL if Tavily didn't provide one
      var pubDate = item.published_date || extractDateFromUrl(item.url);
      return {
        title: item.title || '',
        url: item.url || '',
        content: String(item.content || item.snippet || '').substring(0, 400),
        published_date: pubDate
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
    var highQuality = findings.filter(function(f) {
      return (f.verdict === 'SIGNAL' || f.verdict === 'WATCH') && f.confidence >= 4;
    });
    if (highQuality.length === 0) return;
    var domains = {};
    highQuality.forEach(function(f) {
      (f.refs || []).forEach(function(ref) {
        if (!ref.url) return;
        try {
          var d = new URL(ref.url).hostname.replace('www.', '');
          domains[d] = (domains[d] || 0) + 1;
        } catch(e) {}
      });
    });
    var rows = Object.keys(domains).map(function(d) {
      return { domain: d, quality_hits: domains[d], last_seen: new Date().toISOString().split('T')[0], agent_id: findings[0] && findings[0].mind_id };
    });
    if (rows.length > 0) {
      await supabaseCall('POST', 'source_reputation', rows).catch(function(e) {
        console.warn('[YNOT] source_reputation table not ready yet: ' + e.message);
      });
    }
  } catch(e) {
    console.warn('[YNOT] Source reputation recording failed: ' + e.message);
  }
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
    var pub = r.published_date ? ' [published: ' + r.published_date + ']' : ' [NO DATE]';
    return '[' + (i + 1) + '] ' + r.title + pub + '\nURL: ' + r.url + '\n' + r.content;
  }).join('\n\n');
  var memorySection = memory
    ? '\n\nYour findings from the last 4 weeks (for context — do not repeat these, find what is NEW):\n' + memory
    : '';
  var todayStr = new Date().toISOString().split('T')[0];
  var system = 'You are ' + mind.name + ', an autonomous AI research agent. ' + mind.brief +
    ' You have searched the web using your own queries and received real live results. ' +
    'Analyse what you actually found and extract the most significant findings. ' +
    '\n\n=== FRESHNESS REQUIREMENT (CRITICAL - READ CAREFULLY) ===' +
    '\nToday is ' + todayStr + '. This is a WEEKLY briefing covering ONLY the last 7 days.' +
    '\n• ONLY include findings about events, announcements, or developments from the LAST 7 DAYS' +
    '\n• If a source shows [published: YYYY-MM-DD], calculate if it is within 7 days of today. REJECT if older.' +
    '\n• Sources marked [NO DATE] are LOWER PRIORITY - only use if the content clearly describes recent events' +
    '\n• DO NOT include general background information, historical context, or evergreen content' +
    '\n• DO NOT report on old laws, old regulations, or past events as if they are new' +
    '\n• Each finding must be about something that HAPPENED or was ANNOUNCED in the last 7 days' +
    '\n• If you cannot find 3+ genuinely fresh findings, return fewer findings rather than padding with old content' +
    '\n=== END FRESHNESS REQUIREMENT ===' +
    '\n\nLEGAL SAFETY REQUIREMENT (NON-NEGOTIABLE): You are an EDUCATIONAL intelligence platform, not an investigative journalist. ' +
    'OBSERVE, DON\'T ACCUSE. State facts, not judgments. Document verification status, don\'t imply fraud. ' +
    '\n\nBANNED WORDS (never use): suspicious, dubious, questionable, exposed, revealed, hype, washing, fake, fabricated, hiding, refusing, coordinated, collusion, misleading, deceptive, dishonest. ' +
    '\n\nSAFE FRAMING: "[Entity] reports [claim]; independent validation not published" NOT "Suspicious pattern suggests coordinated marketing". ' +
    'Use: reports, states, claims, announces, not published, not disclosed, not documented, independent validation, third-party verification. ' +
    'TONE: University researcher writing peer-reviewed paper, not tabloid exposé. ' +
    '\n\nVENDOR-NEUTRAL RULE (NON-NEGOTIABLE): This is a MARKET-LEVEL intelligence platform, not a vendor tracker. ' +
    'NEVER center a finding around a single company, consultancy, or vendor (e.g. "Accenture launches...", "McKinsey reports...", "Guidewire releases..."). ' +
    'Instead, identify the MARKET PATTERN or TECHNOLOGY TREND the vendor activity represents. ' +
    'Example: Instead of "Accenture launches AI claims platform" write "Consulting-led AI claims platforms entering carrier procurement cycles — multiple system integrators now offering turnkey solutions." ' +
    'Vendor names may appear as supporting evidence INSIDE a finding body, but must NEVER be the subject of the title. ' +
    'If the only source is a vendor press release or product announcement with no independent validation, verdict must be UNVERIFIED. ' +
    '\n\nBe honest: if evidence is weak, reflect that in verdict and confidence. ' +
    'Use real URLs from the search results as your refs — copy them exactly. NEVER invent URLs. ' +
    'Return ONLY a valid JSON array of 3-5 findings (or fewer if insufficient fresh content). ' +
    'Each finding must have: title (string), verdict ("SIGNAL"|"WATCH"|"UNVERIFIED"), ' +
    'body (2-3 sentences: what it is and what is currently understood about it in the insurance context — describe factually, do not prescribe or recommend), ' +
    'confidence (1-5 integer), domain (string), subdomain (string), ' +
    'trl (1-9 integer), regulatoryRisk ("low"|"medium"|"high"), ' +
    'experiment (a research question or learning hypothesis worth exploring further — frame as curiosity, not a recommendation or action item), ' +
    'regions (array of strings — tag which regions this finding is relevant to. Use: "US", "EU", "UK", "APAC", "Global". Most findings will be "Global". Use specific regions when the finding mentions specific geographies, regulators like FCA→"UK", EIOPA→"EU", NAIC→"US", or carriers in specific markets), ' +
    'refs (array of {label, url} using real URLs from results), ' +
    'signal_status ("NEW"|"EMERGING"|"CONFIRMED"|"RECURRING") — NEW if first time seeing this topic, ' +
    'EMERGING if seen once before, CONFIRMED if seen 2+ times, RECURRING if it has appeared every week. ' +
    '\n\nVERDICT CRITERIA (use these objective rules): ' +
    '\n• SIGNAL: (1) Multiple independent sources (2+ refs from different organizations), (2) Quantified claims with specific numbers/data, (3) Named deployments or peer-reviewed research, (4) Confidence ≥ 4. ' +
    '\n• WATCH: (1) Single source OR early-stage development, (2) Qualitative claims or limited data, (3) Worth monitoring as evidence develops, (4) Confidence 2-3. ' +
    '\n• UNVERIFIED: (1) Claims lack independent third-party validation, (2) Single vendor/promotional source only, (3) Quantified claims with no external benchmarks, (4) Not necessarily false, but verification status unclear. Use UNVERIFIED for factual accuracy — this means "we cannot independently verify" not "this is false." Confidence 1-2. ' +
    '\n\nIMPORTANT: UNVERIFIED is a factual statement about verification status, not a quality judgment. Frame objectively. ' +
    'LEGAL SAFETY: Never imply fraud, collusion, or intent to deceive. State verification gaps factually.';
  var user = 'Your search queries this week:\n' + queries.map(function(q, i) { return (i + 1) + '. ' + q; }).join('\n') +
    '\n\nLive web results:\n\n' + resultsText + memorySection +
    '\n\nProduce your findings. Return only the JSON array.';
  try {
    var raw = await claudeCall(system, user, 1800);
    var match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('no JSON array');
    var findings = JSON.parse(match[0]);
    if (!Array.isArray(findings)) throw new Error('not array');
    
    // Build URL-to-date lookup from original Tavily results
    var urlDateMap = {};
    results.forEach(function(r) {
      if (r.url && r.published_date) {
        urlDateMap[r.url] = r.published_date;
      }
    });
    
    // Verify refs and attach metadata including published_date from Tavily
    var enriched = await Promise.all(findings.map(async function(f) {
      // Enrich refs with published_date from original Tavily results
      var refsWithDates = (f.refs || []).map(function(ref) {
        var enrichedRef = Object.assign({}, ref);
        if (ref.url && urlDateMap[ref.url]) {
          enrichedRef.published_date = urlDateMap[ref.url];
        }
        return enrichedRef;
      });
      var verifiedRefs = await verifyRefs(refsWithDates);
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

// ── LAYER 3: PROGRAMMATIC FRESHNESS VALIDATION ────────────────────────────
function validateSourceFreshness(findings) {
  var sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  var today = new Date().toISOString().split('T')[0];
  
  return findings.map(function(f) {
    var freshRefs = [];
    var staleRefs = [];
    var undatedRefs = [];
    var newestDate = null;
    
    (f.refs || []).forEach(function(ref) {
      if (ref.published_date) {
        try {
          var pubTime = new Date(ref.published_date).getTime();
          if (pubTime >= sevenDaysAgo) {
            freshRefs.push(ref);
            if (!newestDate || pubTime > new Date(newestDate).getTime()) {
              newestDate = ref.published_date;
            }
          } else {
            staleRefs.push(ref);
            console.warn('[YNOT] Removed stale ref (' + ref.published_date + '): ' + ref.url);
          }
        } catch(e) {
          undatedRefs.push(ref); // Invalid date format, treat as undated
        }
      } else {
        undatedRefs.push(ref); // No date, keep but deprioritize
      }
    });
    
    // Determine freshness priority: 1=fresh (has recent dates), 2=undated, 3=stale (only old dates)
    var priority = 3; // default: stale
    var flag = 'stale';
    
    if (freshRefs.length > 0) {
      priority = 1;
      flag = 'fresh';
    } else if (undatedRefs.length > 0 && staleRefs.length === 0) {
      priority = 2;
      flag = 'undated';
    }
    
    // Keep fresh refs + undated refs, discard stale refs
    var keptRefs = freshRefs.concat(undatedRefs);
    
    return Object.assign({}, f, {
      refs: keptRefs,
      source_published_date: newestDate,
      freshness_flag: flag,
      freshness_priority: priority
    });
  }).filter(function(f) {
    // Remove findings with NO refs left after filtering
    if (f.refs.length === 0) {
      console.warn('[YNOT] Removed finding (no fresh refs): ' + f.title);
      return false;
    }
    return true;
  });
}

// ── TOPIC KEY NORMALIZATION ───────────────────────────────────────────────
function normalizeTopicKey(title) {
  return String(title || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\b(the|a|an|in|on|at|for|to|of|and|or|is|are|was|were|with|by|from|as|its|this|that)\b/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
}

// ── SIGNAL TRAJECTORIES UPDATE ─────────────────────────────────────────────
async function updateSignalTrajectories(findings, runDate) {
  try {
    // Build topic map from this run
    var topics = {};
    findings.forEach(function(f) {
      var key = normalizeTopicKey(f.title);
      if (!topics[key]) {
        topics[key] = { title: f.title, key: key, trl: f.trl, verdict: f.verdict, confidence: f.confidence, minds: [f.mind_id], domain: f.domain, regions: f.regions || ['Global'] };
      } else {
        if (topics[key].minds.indexOf(f.mind_id) === -1) topics[key].minds.push(f.mind_id);
        if (f.confidence > topics[key].confidence) {
          topics[key].confidence = f.confidence;
          topics[key].trl = f.trl;
          topics[key].verdict = f.verdict;
        }
      }
    });

    // Fetch existing trajectories
    var existingData = [];
    try {
      existingData = await supabaseCall('GET', 'signal_trajectories', null, '?select=id,topic_key,appearances,trajectory_data,current_trl,first_seen&limit=500');
    } catch(e) {
      console.warn('[YNOT] signal_trajectories table may not exist yet: ' + e.message);
      return;
    }
    var existingMap = {};
    existingData.forEach(function(row) { existingMap[row.topic_key] = row; });

    var upserts = [];
    Object.keys(topics).forEach(function(key) {
      var t = topics[key];
      var existing = existingMap[key];
      var snapshot = { date: runDate, trl: t.trl, verdict: t.verdict, confidence: t.confidence, minds: t.minds };

      if (existing) {
        var trajData = existing.trajectory_data || [];
        trajData.push(snapshot);
        var appearances = (existing.appearances || 0) + 1;
        var trlVelocity = trajData.length >= 2 ? (t.trl - trajData[0].trl) / trajData.length : 0;
        var crossAgentCount = t.minds.length;
        var compoundScore = Math.round(((Math.min(appearances, 10) / 10) * 0.3 + (t.confidence / 5) * 0.2 + (Math.min(crossAgentCount, 4) / 4) * 0.25 + (Math.max(0, Math.min(trlVelocity + 0.5, 1))) * 0.25) * 100);

        upserts.push({
          id: existing.id,
          topic_key: key,
          title: t.title,
          domain: t.domain,
          regions: t.regions,
          current_trl: t.trl,
          current_verdict: t.verdict,
          current_confidence: t.confidence,
          last_seen: runDate,
          first_seen: existing.first_seen,
          appearances: appearances,
          cross_agent_count: crossAgentCount,
          compound_score: compoundScore,
          trl_velocity: Math.round(trlVelocity * 100) / 100,
          trajectory_data: trajData
        });
      } else {
        upserts.push({
          topic_key: key,
          title: t.title,
          domain: t.domain,
          regions: t.regions,
          current_trl: t.trl,
          current_verdict: t.verdict,
          current_confidence: t.confidence,
          first_seen: runDate,
          last_seen: runDate,
          appearances: 1,
          cross_agent_count: t.minds.length,
          compound_score: Math.round(((1/10) * 0.3 + (t.confidence / 5) * 0.2 + (Math.min(t.minds.length, 4) / 4) * 0.25 + 0.5 * 0.25) * 100),
          trl_velocity: 0,
          trajectory_data: [snapshot]
        });
      }
    });

    if (upserts.length > 0) {
      // Use POST with upsert via Prefer header
      var url = SUPABASE_URL + '/rest/v1/signal_trajectories';
      var r = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(upserts)
      });
      if (!r.ok) {
        var t = await r.text().catch(function() { return ''; });
        console.warn('[YNOT] signal_trajectories upsert: ' + r.status + ' ' + t);
      } else {
        console.log('[YNOT] Signal trajectories updated: ' + upserts.length + ' topics');
      }
    }
  } catch(e) {
    console.warn('[YNOT] Signal trajectories update failed (non-blocking): ' + e.message);
  }
}

// ── RAW INTELLIGENCE STORAGE ───────────────────────────────────────────────
async function storeRawIntelligence(mindId, queries, results, runId, runDate) {
  try {
    var row = {
      run_id: runId,
      run_date: runDate,
      mind_id: mindId,
      search_queries: queries,
      result_count: results.length,
      results: results.slice(0, 15).map(function(r) {
        return { title: r.title, url: r.url, content: r.content, published_date: r.published_date };
      })
    };
    await supabaseCall('POST', 'intelligence_raw', [row]).catch(function(e) {
      console.warn('[YNOT] intelligence_raw table not ready: ' + e.message);
    });
  } catch(e) {
    console.warn('[YNOT] Raw intel storage failed: ' + e.message);
  }
}

// ── CROSS-AGENT AGREEMENT DETECTION ────────────────────────────────────────
async function detectCrossAgentAgreement(findings, runDate) {
  try {
    var topicMindMap = {};
    findings.forEach(function(f) {
      var words = String(f.title || '').toLowerCase().split(/\s+/).filter(function(w) { return w.length > 4; });
      findings.forEach(function(f2) {
        if (f2.mind_id === f.mind_id) return;
        var words2 = String(f2.title || '').toLowerCase().split(/\s+/).filter(function(w) { return w.length > 4; });
        var overlap = words.filter(function(w) { return words2.indexOf(w) >= 0; });
        if (overlap.length >= 2) {
          var key = overlap.sort().join('-');
          if (!topicMindMap[key]) topicMindMap[key] = { topic: overlap.join(' '), minds: new Set(), findings: [] };
          topicMindMap[key].minds.add(f.mind_id);
          topicMindMap[key].minds.add(f2.mind_id);
          topicMindMap[key].findings.push(f.title);
        }
      });
    });

    var agreements = Object.keys(topicMindMap)
      .filter(function(k) { return topicMindMap[k].minds.size >= 2; })
      .map(function(k) {
        var a = topicMindMap[k];
        return {
          run_date: runDate,
          topic_key: k,
          topic_label: a.topic,
          agent_count: a.minds.size,
          agents: Array.from(a.minds),
          finding_titles: a.findings.slice(0, 5),
          agreement_strength: Math.min(a.minds.size / 4, 1)
        };
      })
      .sort(function(a, b) { return b.agent_count - a.agent_count; })
      .slice(0, 10);

    if (agreements.length > 0) {
      await supabaseCall('POST', 'cross_agent_agreements', agreements).catch(function(e) {
        console.warn('[YNOT] cross_agent_agreements table not ready: ' + e.message);
      });
      console.log('[YNOT] Cross-agent agreements detected: ' + agreements.length);
    }
  } catch(e) {
    console.warn('[YNOT] Cross-agent agreement detection failed: ' + e.message);
  }
}

async function runAgent(mind, runId, runDate) {
  console.log('[YNOT] ' + mind.name + ': loading memory...');
  var memory = await fetchAgentMemory(mind.id);
  console.log('[YNOT] ' + mind.name + ': ' + (memory ? 'memory loaded' : 'no prior memory'));
  console.log('[YNOT] ' + mind.name + ': generating queries...');
  var queries = await generateQueries(mind, memory);
  console.log('[YNOT] ' + mind.name + ': queries: ' + queries.join(' | '));
  var results = await fetchAgentResults(queries);
  console.log('[YNOT] ' + mind.name + ': ' + results.length + ' unique results from Tavily');
  if (results.length === 0) { console.warn('[YNOT] ' + mind.name + ': no results, skipping'); return []; }
  await storeRawIntelligence(mind.id, queries, results, runId, runDate);
  var findings = await analyseResults(mind, queries, results, memory);
  console.log('[YNOT] ' + mind.name + ': ' + findings.length + ' findings (refs verified)');
  await recordSourceReputation(findings);
  return findings;
}

// ── WEEKLY DIGEST ─────────────────────────────────────────────────────────
async function generateWeeklyDigest(findings, runDate) {
  var signals = findings.filter(function(f) { return f.verdict === 'SIGNAL'; });
  var watches  = findings.filter(function(f) { return f.verdict === 'WATCH'; });
  var unverified = findings.filter(function(f) { return f.verdict === 'UNVERIFIED' || f.verdict === 'NOISE'; }); // Include legacy NOISE
  var top = signals.slice(0, 5).concat(watches.slice(0, 3));
  var findingsText = top.map(function(f) {
    return f.title + ' [' + f.verdict + ', TRL ' + (f.trl || '?') + ', ' + f.domain + ', ' + (f.signal_status || 'NEW') + ']: ' + String(f.body || '').substring(0, 200);
  }).join('\n');
  var prompt = 'Week of ' + runDate + '. Five autonomous agents independently searched the web this week using self-generated queries. ' +
    'Total findings: ' + findings.length + ' (' + signals.length + ' Signals, ' + watches.length + ' Watch, ' + unverified.length + ' Unverified).\n\n' +
    'Top findings:\n' + findingsText + '\n\n' +
    'Write an educational intelligence briefing for anyone curious about AI in insurance — practitioners, students, researchers, and leaders alike.\n\n' +
    'CRITICAL FORMAT RULES:\n' +
    '- Output PLAIN TEXT only. NO markdown formatting (no **, no *, no #, no [])\n' +
    '- Do NOT include section labels like [HOOK] or [CONTEXT] in the output\n' +
    '- Each bullet MUST start with -> followed by a space\n\n' +
    'Structure (follow exactly, no labels):\n\n' +
    'First line: One specific, concrete, slightly surprising sentence from a real finding. No cliches.\n\n' +
    'Second paragraph: 1-2 sentences on what the agents found. Mention "Eight autonomous agents" and finding counts naturally.\n\n' +
    '-> Finding title - One sharp sentence about what was found\n' +
    '-> Finding title - One sharp sentence\n' +
    '-> Finding title - One sharp sentence\n' +
    '-> Finding title - One sharp sentence\n' +
    '-> Finding title - One sharp sentence\n\n' +
    'Final line: One observational sentence on what is worth following. No "In conclusion". No "The future is...".\n\n' +
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
  var outcomes = await Promise.allSettled(MINDS.map(function(m) { return runAgent(m, runId, runDate); }));
  outcomes.forEach(function(o, i) {
    if (o.status === 'fulfilled') allFindings = allFindings.concat(o.value);
    else errors.push({ mind: MINDS[i].id, error: o.reason && o.reason.message });
  });

  if (allFindings.length === 0) {
    return res.status(500).json({ error: 'All agents failed', errors: errors });
  }

  // LAYER 3: Apply programmatic freshness validation
  console.log('[YNOT] Applying freshness validation (7-day window)...');
  var preValidationCount = allFindings.length;
  allFindings = validateSourceFreshness(allFindings);
  console.log('[YNOT] Freshness validation: ' + preValidationCount + ' → ' + allFindings.length + ' findings retained');

  // VENDOR-NEUTRAL FILTER: programmatically block vendor-centric titles
  var preVendorCount = allFindings.length;
  allFindings = applyVendorFilter(allFindings);
  if (preVendorCount !== allFindings.length) {
    console.log('[YNOT] Vendor filter: ' + preVendorCount + ' → ' + allFindings.length + ' findings retained');
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
      regions: f.regions || ['Global'],
      refs: f.refs || [],
      search_queries: f.search_queries || [],
      signal_status: f.signal_status || 'NEW',
      source_published_date: f.source_published_date || null,
      freshness_flag: f.freshness_flag || 'undated',
      freshness_priority: f.freshness_priority || 2
    };
  });

  try {
    await supabaseCall('POST', 'findings', rows);
    console.log('[YNOT] Phase 1 complete: ' + allFindings.length + ' findings stored. run_id=' + runId);
  } catch(err) {
    return res.status(500).json({ error: 'Storage failed', details: err.message });
  }

  // Update signal trajectories (non-blocking)
  await updateSignalTrajectories(allFindings, runDate).catch(function(e) {
    console.warn('[YNOT] Trajectory update error: ' + e.message);
  });

  // Detect cross-agent agreement (non-blocking)
  await detectCrossAgentAgreement(allFindings, runDate).catch(function(e) {
    console.warn('[YNOT] Agreement detection error: ' + e.message);
  });

  var digestStatus = 'skipped';
  try { await saveWeeklyDigest(allFindings, runId, runDate); digestStatus = 'ready'; }
  catch(dErr) { console.error('[YNOT] Digest failed:', dErr.message); digestStatus = 'error: ' + dErr.message; }

  return res.status(200).json({
    success: true, phase: 1, run_id: runId, run_date: runDate,
    findings_count: allFindings.length, digest: digestStatus, errors: errors,
    trajectories_updated: true,
    note: 'Phase 2 synthesis (Null, Weave, Faro) runs at 06:02 UTC via cron-synthesise.js'
  });
};
