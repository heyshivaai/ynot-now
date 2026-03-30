// api/context-hub.js
// Exports YNOT.NOW weekly findings as Context Hub-compatible markdown.
//
// GET /api/context-hub                         → full insurance-ai-signals DOC.md
// GET /api/context-hub?domain=life             → life/annuities/retirement signals
// GET /api/context-hub?domain=pc               → P&C signals
// GET /api/context-hub?domain=regulation       → regulatory signals
// GET /api/context-hub?domain=climate          → climate/ESG signals
// GET /api/context-hub?domain=horizontal       → horizontal tech signals
// GET /api/context-hub?format=json             → raw JSON (machine-readable)
// GET /api/context-hub?weeks=4                 → last N weeks of findings (default: 2)
//
// This endpoint is the live source for the Context Hub DOC.md files.
// The GitHub Action reads this endpoint and commits the output to the Context Hub repo.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const DOMAIN_MAP = {
  'life':       ['Life'],
  'pc':         ['P&C', 'P_C', 'Property', 'Casualty', 'Commercial', 'Specialty'],
  'regulation': ['Regulation', 'Regulatory', 'Compliance'],
  'climate':    ['Climate', 'ESG', 'Catastrophe', 'Parametric'],
  'horizontal': ['Horizontal', 'Tech', 'Foundation', 'Agentic', 'AI']
};

// ISO week string for a date (YYYY-Www)
function isoWeek(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  const diff = d - startOfWeek1;
  const week = Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Fetch findings from Supabase
async function fetchFindings(domainFilter, weeksBack) {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - (weeksBack * 7));
  const cutoffStr = cutoff.toISOString().split('T')[0];

  let query = `findings?select=*&created_at=gte.${cutoffStr}&order=created_at.desc&limit=200`;

  const res = await fetch(SUPABASE_URL + '/rest/v1/' + query, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY
    }
  });

  if (!res.ok) throw new Error('Supabase ' + res.status);
  let findings = await res.json();

  // Filter by domain if requested
  if (domainFilter && DOMAIN_MAP[domainFilter]) {
    const allowed = DOMAIN_MAP[domainFilter].map(d => d.toLowerCase());
    findings = findings.filter(f => {
      const d = (f.domain || '').toLowerCase();
      return allowed.some(a => d.includes(a));
    });
  }

  // Only return SIGNAL and WATCH verdicts (not NOISE)
  findings = findings.filter(f => f.verdict === 'SIGNAL' || f.verdict === 'WATCH');

  return findings;
}

// Format a single finding as a markdown section
function formatFinding(f, index) {
  const status = f.signal_status || 'NEW';
  const verdict = f.verdict || 'WATCH';
  const trl = f.trl ? `TRL ${f.trl}` : '';
  const confidence = f.confidence ? `${Math.round(f.confidence * 100)}% confidence` : '';
  const meta = [verdict, status, trl, confidence].filter(Boolean).join(' · ');

  const lines = [
    `### ${index}. ${f.title || 'Untitled'}`,
    `**${meta}** | ${f.domain || ''}${f.subdomain ? ' / ' + f.subdomain : ''}`,
    '',
    f.body || f.summary || '',
    ''
  ];

  if (f.source_url) {
    lines.push(`**Source:** ${f.source_url}`);
    lines.push('');
  }

  if (f.agent) {
    lines.push(`*Identified by: ${f.agent} agent*`);
    lines.push('');
  }

  return lines.join('\n');
}

// Group findings by week
function groupByWeek(findings) {
  const groups = {};
  for (const f of findings) {
    const week = isoWeek(f.created_at.split('T')[0]);
    if (!groups[week]) groups[week] = [];
    groups[week].push(f);
  }
  return groups;
}

// Fetch signal trajectories from Supabase
async function fetchTrajectories(domainFilter) {
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/signal_trajectories?order=compound_score.desc&limit=20', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    if (!res.ok) return [];
    let trajectories = await res.json();
    if (domainFilter) {
      trajectories = trajectories.filter(t =>
        (t.domain || '').toLowerCase().includes(domainFilter)
      );
    }
    return trajectories;
  } catch (e) { return []; }
}

// Fetch cross-agent agreements from Supabase (last 2 weeks)
async function fetchAgreements() {
  try {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 14);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    const res = await fetch(
      SUPABASE_URL + '/rest/v1/cross_agent_agreements?run_date=gte.' + cutoffStr + '&order=agreement_strength.desc&limit=15',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
    );
    if (!res.ok) return [];
    return await res.json();
  } catch (e) { return []; }
}

// Build the full DOC.md for a domain (or all domains)
function buildDocMd(findings, domainFilter, updatedOn, trajectories, agreements) {
  const signals = findings.filter(f => f.verdict === 'SIGNAL');
  const watches = findings.filter(f => f.verdict === 'WATCH');
  const byWeek = groupByWeek(findings);
  const weeks = Object.keys(byWeek).sort().reverse();

  const domainLabels = {
    'life': 'Life Insurance, Annuities & Retirement',
    'pc': 'Property & Casualty Insurance',
    'regulation': 'Insurance AI Regulation & Compliance',
    'climate': 'Climate Risk & ESG in Insurance',
    'horizontal': 'Horizontal AI Technology for Insurance',
    null: 'Insurance AI & Insurtech Intelligence'
  };

  const domainTags = {
    'life': 'life-insurance,annuities,retirement,longevity,actuarial',
    'pc': 'property-casualty,underwriting,claims,telematics,commercial',
    'regulation': 'regulation,compliance,NAIC,FCA,EU-AI-Act,EIOPA,explainability',
    'climate': 'climate-risk,ESG,parametric,catastrophe,flood,wildfire',
    'horizontal': 'foundation-models,agentic-AI,synthetic-data,federated-learning',
    null: 'insurance,insurtech,AI,machine-learning,underwriting,claims,regulation'
  };

  const label = domainLabels[domainFilter] || domainLabels[null];
  const tags = domainTags[domainFilter] || domainTags[null];
  const name = domainFilter ? `insurance-${domainFilter}-signals` : 'insurance-ai-signals';
  const description = domainFilter
    ? `Weekly AI signal intelligence for ${label} — curated by YNOT.NOW multi-agent system`
    : `Weekly insurance AI & insurtech signal intelligence — curated by YNOT.NOW multi-agent system across Life, P&C, Regulation, Climate, and Horizontal tech`;

  const frontmatter = `---
name: ${name}
description: "${description}"
metadata:
  languages: "agnostic"
  versions: "weekly"
  updated-on: "${updatedOn}"
  source: community
  tags: "${tags},ynot-now,weekly-intelligence"
---`;

  const intro = `# ${label} — Weekly AI Signal Intelligence

> **Source:** [YNOT.NOW](https://ynot-now.vercel.app) — Autonomous multi-agent intelligence system for insurance AI
> **Update cadence:** Every Monday at 06:00 UTC
> **Coverage period:** Last ${weeks.length} week(s) — ${weeks[weeks.length - 1] || ''} to ${weeks[0] || ''}
> **Signals this period:** ${signals.length} confirmed signals, ${watches.length} watch items

## How to Use This Intelligence

This document is machine-readable domain knowledge for AI agents building in insurance. Each finding includes:
- **Verdict**: SIGNAL (high confidence, actionable) or WATCH (emerging, monitor)
- **Signal Status**: NEW | EMERGING | CONFIRMED | RECURRING
- **TRL**: Technology Readiness Level 1–9 (1=idea, 9=proven in production)
- **Confidence**: Percentage confidence from multi-agent cross-validation
- **Domain**: Insurance vertical (Life, P&C, Regulation, Climate, Horizontal)

## Quick Reference: What Matters This Week

| Finding | Verdict | Status | Domain |
|---------|---------|--------|--------|
${findings.slice(0, 10).map(f => `| ${(f.title || '').slice(0, 60)} | ${f.verdict} | ${f.signal_status || 'NEW'} | ${f.domain || ''} |`).join('\n')}

---`;

  // Signal Trajectories section (strongest signals over time)
  let trajSection = '';
  if (trajectories && trajectories.length > 0) {
    const trajRows = trajectories.slice(0, 10).map(t => {
      const velocity = t.trl_velocity > 0 ? '↑' : t.trl_velocity < 0 ? '↓' : '→';
      return `| ${(t.title || t.topic_key || '').slice(0, 55)} | ${t.compound_score || 0} | TRL ${t.current_trl || '?'} ${velocity} | ${t.appearances || 1}w | ${t.cross_agent_count || 1} agents |`;
    }).join('\n');

    trajSection = `

## Signal Trajectories — Strongest Compound Signals

Topics that persist across multiple weeks accumulate a compound score (0–100) based on persistence, confidence, cross-agent agreement, and TRL velocity. Higher = stronger signal.

| Topic | Score | TRL | Persistence | Agreement |
|-------|-------|-----|-------------|-----------|
${trajRows}

`;
  }

  // Cross-agent agreements section
  let agreeSection = '';
  if (agreements && agreements.length > 0) {
    const agreeRows = agreements.slice(0, 8).map(a => {
      return `| ${(a.topic_label || a.topic_key || '').slice(0, 50)} | ${(a.agents || []).join(', ')} | ${a.agreement_strength ? a.agreement_strength.toFixed(1) : '?'} |`;
    }).join('\n');

    agreeSection = `
## Cross-Agent Agreement Index

When 2+ agents independently surface the same topic, it's a stronger signal. These topics had the highest agreement this period.

| Topic | Agents | Strength |
|-------|--------|----------|
${agreeRows}

`;
  }

  const weekSections = weeks.map(week => {
    const wFindings = byWeek[week];
    const wSignals = wFindings.filter(f => f.verdict === 'SIGNAL');
    const wWatches = wFindings.filter(f => f.verdict === 'WATCH');

    const header = `## Week ${week}\n\n**${wSignals.length} Signals · ${wWatches.length} Watch items · ${wFindings.length} total**\n`;

    let idx = 1;
    const signalSection = wSignals.length > 0
      ? `### Signals\n\n${wSignals.map(f => formatFinding(f, idx++)).join('\n---\n\n')}`
      : '';

    const watchSection = wWatches.length > 0
      ? `### Watch\n\n${wWatches.map(f => formatFinding(f, idx++)).join('\n---\n\n')}`
      : '';

    return [header, signalSection, watchSection].filter(Boolean).join('\n');
  }).join('\n\n---\n\n');

  const footer = `---

## About YNOT.NOW

YNOT.NOW is an autonomous multi-agent intelligence system that scans the insurance AI landscape every week. Eight specialized agents run in two phases:

**Phase 1 — Exploratory Agents (parallel):**
- **Scout** — P&C insurance AI (underwriting, claims, telematics)
- **Vita** — Life, Annuities & Retirement AI (NO health insurance)
- **Lex** — Insurance AI regulation (NAIC, FCA, EIOPA, EU AI Act)
- **Terra** — Climate risk, ESG, parametric insurance AI
- **Horizon** — Horizontal enterprise AI with insurance implications

**Phase 2 — Synthesis Agents (extended thinking):**
- **Null** — Cross-validates all Phase 1 findings, removes noise
- **Weave** — Identifies cross-domain patterns and convergence signals
- **Faro** — Strategic synthesis and forward-looking intelligence

**Trust mechanisms:** URL verification, agent memory (tracks signal evolution week-over-week), source reputation scoring, extended thinking for synthesis agents.

**Live endpoint:** \`GET https://ynot-now.vercel.app/api/context-hub\`
**Domain filters:** \`?domain=life|pc|regulation|climate|horizontal\`
**JSON output:** \`?format=json\`

*This document is auto-generated every Monday after the weekly intelligence run.*`;

  return [frontmatter, '', intro, trajSection, agreeSection, '', weekSections, '', footer].join('\n');
}

// Log API usage to Supabase (fire-and-forget, never blocks response)
function logUsage(req, domain, format, findingsCount) {
  try {
    const ua = req.headers['user-agent'] || '';
    const referer = req.headers['referer'] || req.headers['origin'] || '';
    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '';

    // Classify the consumer
    let consumer_type = 'unknown';
    if (ua.includes('chub') || ua.includes('context-hub')) consumer_type = 'context-hub-cli';
    else if (referer.includes('github.com') || ua.includes('github-actions')) consumer_type = 'github-action';
    else if (ua.includes('curl') || ua.includes('wget') || ua.includes('httpie')) consumer_type = 'cli-tool';
    else if (ua.includes('python') || ua.includes('node') || ua.includes('axios')) consumer_type = 'programmatic';
    else if (ua.includes('Mozilla') || ua.includes('Chrome') || ua.includes('Safari')) consumer_type = 'browser';

    const row = {
      endpoint: 'context-hub',
      domain_filter: domain || 'all',
      format: format,
      consumer_type: consumer_type,
      user_agent: ua.slice(0, 500),
      referer: referer.slice(0, 500),
      findings_served: findingsCount,
      ip_hash: ip ? Buffer.from(ip).toString('base64').slice(0, 12) : null,
      created_at: new Date().toISOString()
    };

    fetch(SUPABASE_URL + '/rest/v1/api_usage', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(row)
    }).catch(() => {}); // silent fail — tracking should never break the API
  } catch (e) { /* never block */ }
}

export default async function handler(req, res) {
  // CORS headers for public access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const domain = req.query.domain || null;
    const format = req.query.format || 'markdown';
    const weeks = Math.min(parseInt(req.query.weeks || '2', 10), 8);

    // Validate domain filter
    if (domain && !DOMAIN_MAP[domain]) {
      return res.status(400).json({
        error: 'Invalid domain. Use: life, pc, regulation, climate, horizontal'
      });
    }

    const findings = await fetchFindings(domain, weeks);
    const trajectories = await fetchTrajectories(domain);
    const agreements = await fetchAgreements();

    // Track usage (fire-and-forget)
    logUsage(req, domain, format, findings.length);

    if (format === 'json') {
      return res.status(200).json({
        source: 'YNOT.NOW',
        url: 'https://ynot-now.vercel.app',
        domain: domain || 'all',
        weeks_back: weeks,
        generated_at: new Date().toISOString(),
        total_findings: findings.length,
        signals: findings.filter(f => f.verdict === 'SIGNAL').length,
        watches: findings.filter(f => f.verdict === 'WATCH').length,
        findings: findings,
        signal_trajectories: trajectories,
        cross_agent_agreements: agreements
      });
    }

    // Default: return Context Hub-compatible markdown
    const updatedOn = new Date().toISOString().split('T')[0];
    const docMd = buildDocMd(findings, domain, updatedOn, trajectories, agreements);

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // cache 1 hour
    return res.status(200).send(docMd);

  } catch (err) {
    console.error('[context-hub] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
