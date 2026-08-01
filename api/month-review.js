'use strict';
// api/month-review.js
// Generates a monthly narrative synthesis from 4 weeks of findings.
// GET /api/month-review          → current month
// GET /api/month-review?month=2026-03  → specific month
// GET /api/month-review?force=true     → bypass cache

var ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY || '';
var SUPABASE_URL  = process.env.SUPABASE_URL  || '';
var SUPABASE_KEY  = process.env.SUPABASE_KEY  || process.env.SUPABASE_SERVICE_KEY || '';
var CLAUDE_MODEL  = 'claude-sonnet-4-6';

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
      max_tokens: maxTokens || 1500,
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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    var monthParam = req.query.month || null;
    var force = req.query.force === 'true';

    // Determine date range for the month
    var now = new Date();
    var year, month;
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      var parts = monthParam.split('-');
      year = parseInt(parts[0]);
      month = parseInt(parts[1]) - 1;
    } else {
      year = now.getUTCFullYear();
      month = now.getUTCMonth();
    }

    var startDate = new Date(Date.UTC(year, month, 1)).toISOString().split('T')[0];
    var endDate = new Date(Date.UTC(year, month + 1, 0)).toISOString().split('T')[0];
    var monthLabel = new Date(Date.UTC(year, month, 15)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

    // Check cache first
    if (!force) {
      try {
        var cached = await supabaseCall('GET', 'monthly_reviews', null, '?month_key=eq.' + year + '-' + String(month + 1).padStart(2, '0') + '&limit=1');
        if (cached && cached.length > 0) {
          return res.status(200).json({
            month: monthLabel,
            month_key: year + '-' + String(month + 1).padStart(2, '0'),
            review: cached[0].review_text,
            stats: cached[0].stats || {},
            trajectories: cached[0].trajectories || [],
            cached: true
          });
        }
      } catch(e) { /* table may not exist */ }
    }

    // Fetch all findings for the month
    var findings = await supabaseCall('GET', 'findings', null,
      '?run_date=gte.' + startDate + '&run_date=lte.' + endDate + '&order=confidence.desc&limit=200'
    );

    if (!findings || findings.length === 0) {
      return res.status(200).json({ month: monthLabel, review: null, message: 'No findings for this month yet.' });
    }

    // Compute month stats
    var signals = findings.filter(function(f) { return f.verdict === 'SIGNAL'; });
    var watches = findings.filter(function(f) { return f.verdict === 'WATCH'; });
    var unverified = findings.filter(function(f) { return f.verdict === 'UNVERIFIED' || f.verdict === 'NOISE'; });
    var runIds = {};
    findings.forEach(function(f) { runIds[f.run_id] = true; });
    var weekCount = Object.keys(runIds).length;

    // Get domains breakdown
    var domainCounts = {};
    findings.forEach(function(f) {
      var d = f.domain || 'Unknown';
      domainCounts[d] = (domainCounts[d] || 0) + 1;
    });

    // Get signal trajectories if available
    var trajectories = [];
    try {
      trajectories = await supabaseCall('GET', 'signal_trajectories', null,
        '?last_seen=gte.' + startDate + '&appearances=gte.2&order=compound_score.desc&limit=10'
      );
    } catch(e) { /* table may not exist */ }

    // Build trajectory context
    var trajContext = '';
    if (trajectories.length > 0) {
      trajContext = '\n\nSIGNAL TRAJECTORIES (topics that appeared multiple weeks):\n' +
        trajectories.map(function(t) {
          return '- ' + t.title + ' [appeared ' + t.appearances + ' weeks, TRL velocity: ' + (t.trl_velocity > 0 ? '+' : '') + t.trl_velocity + ', compound score: ' + t.compound_score + '/100]';
        }).join('\n');
    }

    // Top findings summary
    var topText = signals.concat(watches).slice(0, 15).map(function(f) {
      return '[' + f.verdict + ' · ' + f.mind_name + ' · TRL' + (f.trl || '?') + ' · ' + (f.signal_status || 'NEW') + '] ' +
        f.title + ' (' + f.domain + '): ' + String(f.body || '').substring(0, 150);
    }).join('\n\n');

    var stats = {
      total_findings: findings.length,
      signals: signals.length,
      watches: watches.length,
      unverified: unverified.length,
      weeks: weekCount,
      domains: domainCounts,
      top_trajectories: trajectories.slice(0, 5).map(function(t) { return { title: t.title, appearances: t.appearances, compound_score: t.compound_score, trl_velocity: t.trl_velocity }; })
    };

    // Generate month review with Claude
    var system = 'You write monthly intelligence reviews for YNOT.NOW, an independent emerging technology signal tracker for the insurance industry — covering AI, automation, data analytics, IoT, blockchain, cybersecurity, and all emerging technologies reshaping insurance. ' +
      'Your tone is that of a well-read, curious observer — like a research analyst writing for peers. ' +
      'You inform and educate. You never advise or recommend. You use specific numbers and named technologies. ' +
      'Plain text only — no markdown, no bold, no asterisks.';

    var prompt = 'Write the ' + monthLabel + ' Month in Review for YNOT.NOW.\n\n' +
      'DATA: ' + findings.length + ' findings across ' + weekCount + ' weekly runs. ' +
      signals.length + ' Signals, ' + watches.length + ' Watch, ' + unverified.length + ' Unverified.\n' +
      'Domains: ' + Object.keys(domainCounts).map(function(d) { return d + ' (' + domainCounts[d] + ')'; }).join(', ') + '\n\n' +
      'TOP FINDINGS:\n' + topText + '\n' +
      trajContext + '\n\n' +
      'Structure (follow exactly):\n\n' +
      'TITLE: ' + monthLabel + ' — Month in Review\n\n' +
      'OPENING (2-3 sentences): What defined this month in insurance AI? Reference the most significant shift or pattern.\n\n' +
      'NARRATIVE ARCS (3-4 paragraphs, each 3-4 sentences):\n' +
      'Each paragraph should tell the story of one theme that emerged across multiple weeks. ' +
      'Name specific findings, note when signals strengthened or faded, and identify what changed from week 1 to week 4. ' +
      'If signal trajectories show topics that appeared multiple weeks, highlight those as strengthening or confirmed patterns.\n\n' +
      'WHAT EMERGED (1 paragraph): New signals that appeared for the first time this month and are worth watching.\n\n' +
      'LOOKING AHEAD (1-2 sentences): What is worth watching next month based on current trajectories. Observational, not prescriptive.\n\n' +
      'Total length: 400-550 words. No banned words: leverage, landscape, transformative, game-changer, revolutionise, unlock, harness, synergy, paradigm.\n' +
      'Return ONLY the review text.';

    var reviewText = await claudeCall(system, prompt, 1200);

    // Cache the review
    try {
      var monthKey = year + '-' + String(month + 1).padStart(2, '0');
      await supabaseCall('POST', 'monthly_reviews', [{
        month_key: monthKey,
        month_label: monthLabel,
        review_text: reviewText,
        stats: stats,
        trajectories: trajectories.slice(0, 10),
        generated_at: new Date().toISOString()
      }]).catch(function() {});
    } catch(e) { /* table may not exist */ }

    return res.status(200).json({
      month: monthLabel,
      month_key: year + '-' + String(month + 1).padStart(2, '0'),
      review: reviewText,
      stats: stats,
      trajectories: trajectories.slice(0, 10).map(function(t) {
        return { title: t.title, domain: t.domain, appearances: t.appearances, compound_score: t.compound_score, trl_velocity: t.trl_velocity, current_verdict: t.current_verdict };
      }),
      cached: false
    });

  } catch(err) {
    console.error('[month-review] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
