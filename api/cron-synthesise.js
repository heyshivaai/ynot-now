'use strict';
// ─── YNOT.NOW — Multi-Agent Cron Phase 2 (Synthesis) ─────────────────────────
// Runs at 06:02 UTC every Monday, 2 minutes after Phase 1 (cron.js).
// Null, Weave, and Faro read ALL Phase 1 findings, then each produces its own
// synthesis findings using Tavily search + cross-agent context.
// Null and Weave use Claude extended thinking for deeper reasoning.
// URL verification, signal_status tracking, and search_queries storage included.
// ─────────────────────────────────────────────────────────────────────────────

var ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY || '';
var SUPABASE_URL  = process.env.SUPABASE_URL  || '';
var SUPABASE_KEY  = process.env.SUPABASE_KEY  || process.env.SUPABASE_SERVICE_KEY || '';
var CRON_SECRET   = process.env.CRON_SECRET   || 'ynot-secret-2025';
var TAVILY_KEY    = process.env.TAVILY_API_KEY || '';
var CLAUDE_MODEL  = 'claude-sonnet-4-20250514';

// ─── SYNTHESIS AGENT DEFINITIONS ─────────────────────────────────────────────
var SYNTHESIS_MINDS = [
  {
    id: 'null', name: 'Null', icon: 'Null',
    domain: 'All',
    brief: 'You are Null, the verification analyst. You have read all findings from the other agents this week. Your job: identify claims that lack independent third-party verification, distinguish vendor marketing from independent evidence, and flag where quantified claims have no external benchmarks. You provide factual analysis of verification status, not quality judgments.',
    role: 'verification',
    extendedThinking: true,
    querySeeds: ['AI insurance claims verification independent study', 'insurtech vendor claims third-party validation', 'AI insurance pilot results peer review', 'insurance AI deployment independent audit']
  },
  {
    id: 'weave', name: 'Weave', icon: 'Weave',
    domain: 'All',
    brief: 'You are Weave, the second-order effects analyst. You have read all findings from the other agents this week. Your job: identify unexpected cross-domain consequences — workforce displacement, new liability classes, competitive dynamics shifts, regulatory arbitrage, and supply chain effects that the primary agents missed.',
    role: 'synthesiser',
    extendedThinking: true,
    querySeeds: ['AI insurance workforce displacement jobs 2026', 'new liability class AI autonomous insurance', 'insurtech competitive disruption incumbent carrier', 'AI insurance distribution channel disruption embedded']
  },
  {
    id: 'faro', name: 'Faro', icon: 'Faro',
    domain: 'All',
    brief: 'You are Faro, the horizon scanner. You have read all findings from the other agents this week. Your job: identify the early-stage signals buried in the noise — emerging research, early pilots, regulatory consultations, startup activity, and technology readiness milestones that will become significant for insurance in 18-36 months.',
    role: 'horizon',
    extendedThinking: false,
    querySeeds: ['insurance AI research emerging 2026 early stage', 'insurtech startup funding seed AI 2026', 'insurance AI pilot proof of concept early', 'actuarial AI research paper preprint 2026']
  }
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function normalizeVerdict(v) {
  var u = String(v || '').toUpperCase();
  if (u === 'SIGNAL') return 'SIGNAL';
  if (u === 'UNVERIFIED') return 'UNVERIFIED';
  if (u === 'NOISE')  return 'UNVERIFIED'; // Legacy support: map old NOISE to UNVERIFIED
  return 'WATCH';
}
function normalizeRisk(r) {
  var l = String(r || '').toLowerCase();
  if (l === 'low')  return 'low';
  if (l === 'high') return 'high';
  return 'medium';
}

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
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

// ─── FETCH TODAY'S PHASE 1 FINDINGS ──────────────────────────────────────────
async function fetchTodaysFindings(runDate) {
  try {
    var data = await supabaseCall('GET', 'findings', null,
      '?run_date=eq.' + runDate + '&order=confidence.desc&limit=40');
    return data || [];
  } catch(e) {
    console.error('[YNOT-S] Could not fetch Phase 1 findings: ' + e.message);
    return [];
  }
}

// ─── TAVILY SEARCH ────────────────────────────────────────────────────────────
async function tavilySearch(query, maxResults) {
  try {
    var r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TAVILY_KEY },
      body: JSON.stringify({
        query: query,
        search_depth: 'basic',
        max_results: maxResults || 4,
        days: 7,  // LAYER 1: Only fetch results from last 7 days
        include_answer: false,
        include_raw_content: false
      })
    });
    if (!r.ok) { console.warn('[YNOT-S] Tavily ' + r.status + ' for: ' + query); return []; }
    var data = await r.json();
    return (data.results || []).map(function(item) {
      return { title: item.title || '', url: item.url || '', content: String(item.content || item.snippet || '').substring(0, 400), published_date: item.published_date || null };
    });
  } catch(e) {
    console.warn('[YNOT-S] Tavily error: ' + e.message);
    return [];
  }
}

// ─── CLAUDE CALL (standard) ─────────────────────────────────────────────────
async function claudeCall(system, user, maxTokens) {
  var r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens || 1200, system: system, messages: [{ role: 'user', content: user }] })
  });
  if (!r.ok) { var t = await r.text().catch(function() { return ''; }); throw new Error('Claude ' + r.status + ': ' + t); }
  var data = await r.json();
  return data.content[0].text.trim();
}

// ─── CLAUDE CALL WITH EXTENDED THINKING (Null and Weave) ───────────────────────
async function claudeCallWithThinking(system, user, maxTokens, thinkingBudget) {
  var budget = thinkingBudget || 4000;
  var totalTokens = budget + (maxTokens || 1200);
  try {
    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'interleaved-thinking-2025-05-14'
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: totalTokens,
        thinking: { type: 'enabled', budget_tokens: budget },
        system: system,
        messages: [{ role: 'user', content: user }]
      })
    });
    if (!r.ok) {
      var t = await r.text().catch(function() { return ''; });
      console.warn('[YNOT-S] Extended thinking failed (' + r.status + '), falling back: ' + t.substring(0, 200));
      return claudeCall(system, user, maxTokens);
    }
    var data = await r.json();
    var textBlock = (data.content || []).find(function(b) { return b.type === 'text'; });
    if (!textBlock) throw new Error('no text block in extended thinking response');
    return textBlock.text.trim();
  } catch(e) {
    console.warn('[YNOT-S] Extended thinking error: ' + e.message + ' — falling back');
    return claudeCall(system, user, maxTokens);
  }
}

// ─── URL VERIFICATION ─────────────────────────────────────────────────────────
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
      var c2 = new AbortController();
      var tid2 = setTimeout(function() { c2.abort(); }, 4000);
      var r2 = await fetch(ref.url, { method: 'GET', signal: c2.signal, redirect: 'follow' });
      clearTimeout(tid2);
      return r2.ok ? ref : null;
    } catch(e) { return null; }
  }));
  var live = verified.filter(Boolean);
  return live.length > 0 ? live : refs;
}

// ─── LAYER 3: PROGRAMMATIC FRESHNESS VALIDATION ──────────────────────────────
function validateSourceFreshness(findings) {
  var sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  
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
            console.warn('[YNOT-S] Removed stale ref (' + ref.published_date + '): ' + ref.url);
          }
        } catch(e) {
          undatedRefs.push(ref);
        }
      } else {
        undatedRefs.push(ref);
      }
    });
    
    var priority = 3;
    var flag = 'stale';
    
    if (freshRefs.length > 0) {
      priority = 1;
      flag = 'fresh';
    } else if (undatedRefs.length > 0 && staleRefs.length === 0) {
      priority = 2;
      flag = 'undated';
    }
    
    var keptRefs = freshRefs.concat(undatedRefs);
    
    return Object.assign({}, f, {
      refs: keptRefs,
      source_published_date: newestDate,
      freshness_flag: flag,
      freshness_priority: priority
    });
  }).filter(function(f) {
    if (f.refs.length === 0) {
      console.warn('[YNOT-S] Removed finding (no fresh refs): ' + f.title);
      return false;
    }
    return true;
  });
}

// ─── SYNTHESIS AGENT RUN ──────────────────────────────────────────────────────
async function runSynthesisAgent(mind, phase1Findings) {
  // Build a summary of Phase 1 findings for context
  var findingsSummary = phase1Findings.slice(0, 20).map(function(f, i) {
    return (i+1) + '. [' + f.mind_name + ' / ' + f.verdict + ' / TRL' + (f.trl||'?') + '] ' +
      f.title + ': ' + String(f.body || '').substring(0, 150);
  }).join('\n');

  // Generate targeted search queries informed by Phase 1 context
  var querySystem = 'You are ' + mind.name + '. ' + mind.brief +
    ' Based on what the other agents found this week (provided below), generate 3 targeted web search queries to deepen your specific analysis. ' +
    'Return ONLY a JSON array of 3 strings.';
  var queryUser = 'Phase 1 findings from Scout, Vita, Lex, Terra, Horizon this week:\n' + findingsSummary +
    '\n\nGenerate 3 search queries for your ' + mind.role + ' analysis. Seed topics: ' + mind.querySeeds.join(', ');

  var queries = mind.querySeeds.slice(0, 3); // fallback
  try {
    var raw = await claudeCall(querySystem, queryUser, 250);
    var match = raw.match(/\[[\s\S]*?\]/);
    if (match) {
      var parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.length > 0) queries = parsed.slice(0, 3).map(function(q) { return String(q); });
    }
  } catch(e) {
    console.warn('[YNOT-S] ' + mind.name + ' query gen failed: ' + e.message);
  }
  console.log('[YNOT-S] ' + mind.name + ' queries: ' + queries.join(' | '));

  // Fetch Tavily results
  var allResults = await Promise.all(queries.map(function(q) { return tavilySearch(q, 4); }));
  var seen = {}; var deduped = [];
  allResults.forEach(function(results) {
    results.forEach(function(item) {
      if (item.url && !seen[item.url]) { seen[item.url] = true; deduped.push(item); }
    });
  });
  console.log('[YNOT-S] ' + mind.name + ': ' + deduped.length + ' Tavily results');

  var resultsText = deduped.slice(0, 10).map(function(r, i) {
    var pub = r.published_date ? ' [published: ' + r.published_date + ']' : ' [NO DATE]';
    return '[' + (i+1) + '] ' + r.title + pub + '\nURL: ' + r.url + '\n' + r.content;
  }).join('\n\n');

  // Synthesis analysis with full Phase 1 context
  var analysisSystem = 'You are ' + mind.name + '. ' + mind.brief +
    ' You have read all findings from the other agents AND searched the web for additional context. ' +
    'CRITICAL DATE REQUIREMENT: This is a WEEKLY briefing for LAST WEEK only. ONLY use sources published within the last 7 days. ' +
    'If you see [published: YYYY-MM-DD], verify it is within the last 7 days from today. Reject any source older than 7 days. ' +
    'Sources marked [NO DATE] can be used but are lower priority than dated sources. ' +
    '\n\nLEGAL SAFETY REQUIREMENT (NON-NEGOTIABLE): You are an EDUCATIONAL intelligence platform, not an investigative journalist. ' +
    'OBSERVE, DON\'T ACCUSE. State facts, not judgments. Document verification status, don\'t imply fraud. ' +
    '\n\nBANNED WORDS (never use): suspicious, dubious, questionable, exposed, revealed, hype, washing, fake, fabricated, hiding, refusing, coordinated, collusion, misleading, deceptive, dishonest. ' +
    '\n\nSAFE FRAMING: "[Entity] reports [claim]; independent validation not published" NOT "Suspicious pattern suggests coordinated marketing". ' +
    'Use: reports, states, claims, announces, not published, not disclosed, not documented, independent validation, third-party verification. ' +
    'TONE: University researcher writing peer-reviewed paper, not tabloid exposé. ' +
    '\n\nProduce synthesis findings that go beyond what the primary agents found — your value is in ' +
    (mind.role === 'verification' ? 'analyzing verification status and distinguishing independently verified claims from unverified ones' :
     mind.role === 'synthesiser' ? 'connecting dots across domains and finding second-order effects' :
     'identifying early-stage signals others missed') + '. ' +
    'Use real URLs from the search results as refs — never invent URLs. ' +
    'Return ONLY a valid JSON array of 2-4 findings. Each must have: ' +
    'title, verdict ("SIGNAL"|"WATCH"|"UNVERIFIED"), body (2-3 sentences: describe what is found and what is understood — factual and observational, not prescriptive), confidence (1-5), ' +
    'domain, subdomain, trl (1-9), regulatoryRisk ("low"|"medium"|"high"), experiment (a research question or learning hypothesis worth exploring — frame as curiosity, not a recommendation), ' +
    'signal_status ("NEW"|"EMERGING"|"CONFIRMED"|"RECURRING"), ' +
    'refs (array of {label, url} from real search results). ' +
    '\n\nVERDICT CRITERIA (use these objective rules): ' +
    '\n• SIGNAL: (1) Multiple independent sources (2+ refs from different organizations), (2) Quantified claims with specific numbers/data, (3) Named deployments or peer-reviewed research, (4) Confidence ≥ 4. ' +
    '\n• WATCH: (1) Single source OR early-stage development, (2) Qualitative claims or limited data, (3) Worth monitoring as evidence develops, (4) Confidence 2-3. ' +
    '\n• UNVERIFIED: (1) Claims lack independent third-party validation, (2) Single vendor/promotional source only, (3) Quantified claims with no external benchmarks, (4) Not necessarily false, but verification status unclear. Use UNVERIFIED for factual accuracy — this means "we cannot independently verify" not "this is false." Confidence 1-2. ' +
    '\n\nIMPORTANT: UNVERIFIED is a factual statement about verification status, not a quality judgment. Frame objectively. ' +
    'LEGAL SAFETY: Never imply fraud, collusion, or intent to deceive. State verification gaps factually.';

  var analysisUser = 'Phase 1 findings from other agents:\n' + findingsSummary +
    '\n\nYour additional web search results:\n\n' + (resultsText || '(no results)') +
    '\n\nProduce your synthesis findings. Return only the JSON array.';

  try {
    var callFn = mind.extendedThinking ? claudeCallWithThinking : claudeCall;
    var raw2 = await callFn(analysisSystem, analysisUser, 1400, 4000);
    var match2 = raw2.match(/\[[\s\S]*\]/);
    if (!match2) throw new Error('no JSON array');
    var findings = JSON.parse(match2[0]);
    if (!Array.isArray(findings)) throw new Error('not array');
    var enriched = await Promise.all(findings.map(async function(f) {
      var verifiedRefs = await verifyRefs(f.refs || []);
      return Object.assign({}, f, {
        mind_id: mind.id, mind_name: mind.name, mind_icon: mind.icon,
        refs: verifiedRefs,
        search_queries: queries,
        signal_status: f.signal_status || 'NEW'
      });
    }));
    console.log('[YNOT-S] ' + mind.name + ': ' + enriched.length + ' synthesis findings' + (mind.extendedThinking ? ' (extended thinking)' : ''));
    return enriched;
  } catch(e) {
    console.error('[YNOT-S] ' + mind.name + ' analysis failed: ' + e.message);
    return [];
  }
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  var auth = req.headers['authorization'] || '';
  var isExternalCall = auth.length > 0;
  if (isExternalCall && auth !== 'Bearer ' + CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!TAVILY_KEY) {
    return res.status(500).json({ error: 'TAVILY_API_KEY not configured' });
  }

  var runDate = new Date().toISOString().split('T')[0];

  // Fetch Phase 1 findings to pass as context to synthesis agents
  console.log('[YNOT-S] Phase 2: fetching Phase 1 findings for ' + runDate + '...');
  var phase1Findings = await fetchTodaysFindings(runDate);

  if (phase1Findings.length === 0) {
    return res.status(200).json({
      success: false,
      phase: 2,
      message: 'No Phase 1 findings found for ' + runDate + ' — Phase 2 skipped. Phase 1 may still be running.',
      run_date: runDate
    });
  }

  console.log('[YNOT-S] Phase 2: ' + phase1Findings.length + ' Phase 1 findings loaded. Running Null, Weave, Faro...');

  // Use the same run_id as Phase 1 (find it from the findings)
  var runId = phase1Findings[0].run_id || ('run_synth_' + Date.now());

  var allSynthFindings = [];
  var errors = [];

  var outcomes = await Promise.allSettled(
    SYNTHESIS_MINDS.map(function(m) { return runSynthesisAgent(m, phase1Findings); })
  );

  outcomes.forEach(function(o, i) {
    if (o.status === 'fulfilled') allSynthFindings = allSynthFindings.concat(o.value);
    else errors.push({ mind: SYNTHESIS_MINDS[i].id, error: o.reason && o.reason.message });
  });

  if (allSynthFindings.length === 0) {
    return res.status(500).json({ error: 'All synthesis agents failed', errors: errors });
  }

  // LAYER 3: Apply programmatic freshness validation
  console.log('[YNOT-S] Applying freshness validation (7-day window)...');
  var preValidationCount = allSynthFindings.length;
  allSynthFindings = validateSourceFreshness(allSynthFindings);
  console.log('[YNOT-S] Freshness validation: ' + preValidationCount + ' → ' + allSynthFindings.length + ' findings retained');

  var rows = allSynthFindings.map(function(f) {
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
      signal_status: f.signal_status || 'NEW',
      source_published_date: f.source_published_date || null,
      freshness_flag: f.freshness_flag || 'undated',
      freshness_priority: f.freshness_priority || 2
    };
  });

  try {
    await supabaseCall('POST', 'findings', rows);
    console.log('[YNOT-S] Phase 2 complete: ' + allSynthFindings.length + ' synthesis findings stored.');
  } catch(err) {
    return res.status(500).json({ error: 'Storage failed', details: err.message });
  }

  // Regenerate the weekly digest now that ALL 8 agents have contributed
  var allFindings = phase1Findings.concat(allSynthFindings);
  try {
    var signals = allFindings.filter(function(f){ return f.verdict === 'SIGNAL'; });
    var watches  = allFindings.filter(function(f){ return f.verdict === 'WATCH'; });
    var unverified = allFindings.filter(function(f){ return f.verdict === 'UNVERIFIED' || f.verdict === 'NOISE'; }); // Include legacy NOISE
    var top = signals.slice(0, 5).concat(watches.slice(0, 3));
    var findingsText = top.map(function(f) {
      return f.title + ' [' + f.verdict + ', TRL ' + (f.trl||'?') + ', ' + f.domain + ']: ' + String(f.body||'').substring(0, 200);
    }).join('\n');

    var prompt = 'Week of ' + runDate + '. Eight autonomous agents independently searched the web this week using self-generated queries. ' +
      'Five primary agents (Scout, Vita, Lex, Terra, Horizon) ran first. ' +
      'Three synthesis agents (Null, Weave, Faro) then read all primary findings and produced cross-agent insights. ' +
      'Total findings: ' + allFindings.length + ' (' + signals.length + ' Signals, ' + watches.length + ' Watch, ' + unverified.length + ' Unverified).\n\n' +
      'Top findings:\n' + findingsText + '\n\n' +
      'Write an educational intelligence briefing for anyone curious about AI in insurance — practitioners, students, researchers, and leaders alike. Format EXACTLY:\n\n' +
      '[HOOK] One specific, concrete, slightly surprising sentence from a real finding. No cliches.\n\n' +
      '[CONTEXT] 1-2 sentences on what the agents found and what it reveals about how AI in insurance is evolving. Mention 8 agents and finding counts naturally.\n\n' +
      '-> [Finding title] - [One sharp sentence: what was found and what it reveals about the state of AI in insurance]\n' +
      '-> [Finding title] - [One sharp sentence]\n' +
      '-> [Finding title] - [One sharp sentence]\n\n' +
      '[CLOSE] One observational sentence on what is worth following or learning more about. No "In conclusion". No "The future is...".\n\n' +
      'All findings this week -> ynot.now\n\n' +
      '#InsurTech #AIinInsurance #Insurance #Innovation\n\n' +
      'Banned words: leverage, landscape, transformative, game-changer, revolutionise, unlock, harness, delve, cutting-edge, unprecedented, seamless. ' +
      'Vary sentence length. Inform, do not advise.';

    var postText = await claudeCall(
      'You write evidence-grounded intelligence briefings for anyone curious about AI in insurance — practitioners, students, and researchers. Your job is to inform and spark curiosity, not to advise or recommend. Sound like a well-read, curious observer. Use specific numbers and named technologies. Never use corporate filler.',
      prompt, 600
    );

    // Replace the Phase 1 digest with the complete 8-agent digest
    await supabaseCall('DELETE', 'weekly_posts', null, '?run_date=eq.' + runDate).catch(function(){});
    await supabaseCall('POST', 'weekly_posts', [{ run_id: runId, run_date: runDate, post_text: postText, status: 'ready' }]);
    console.log('[YNOT-S] Full 8-agent digest regenerated and saved.');
  } catch(dErr) {
    console.error('[YNOT-S] Digest regeneration failed:', dErr.message);
  }

  return res.status(200).json({
    success: true,
    phase: 2,
    run_id: runId,
    run_date: runDate,
    phase1_findings: phase1Findings.length,
    synthesis_findings: allSynthFindings.length,
    total_findings: allFindings.length,
    errors: errors
  });
};
