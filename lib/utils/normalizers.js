'use strict';
// lib/utils/normalizers.js — Data normalization helpers

/**
 * Normalize verdict to SIGNAL | WATCH | UNVERIFIED.
 * Maps legacy NOISE to UNVERIFIED.
 */
function normalizeVerdict(v) {
  var u = String(v || '').toUpperCase();
  if (u === 'SIGNAL') return 'SIGNAL';
  if (u === 'UNVERIFIED') return 'UNVERIFIED';
  if (u === 'NOISE') return 'UNVERIFIED'; // Legacy support
  return 'WATCH';
}

/**
 * Normalize regulatory risk to low | medium | high.
 */
function normalizeRisk(r) {
  var l = String(r || '').toLowerCase();
  if (l === 'low') return 'low';
  if (l === 'high') return 'high';
  return 'medium';
}

/**
 * Normalize a finding title into a topic key for trajectory tracking.
 * Strips stopwords, punctuation, and limits to 80 chars.
 */
function normalizeTopicKey(title) {
  return String(title || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\b(the|a|an|in|on|at|for|to|of|and|or|is|are|was|were|with|by|from|as|its|this|that)\b/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
}

/**
 * Build a normalized finding row for Supabase storage.
 */
function buildFindingRow(f, runId, runDate) {
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
}

module.exports = {
  normalizeVerdict: normalizeVerdict,
  normalizeRisk: normalizeRisk,
  normalizeTopicKey: normalizeTopicKey,
  buildFindingRow: buildFindingRow
};
