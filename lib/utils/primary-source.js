'use strict';
// lib/utils/primary-source.js
// Enforces the PRIMARY-SOURCE RULE at code level, not just in prompts.
//
// If a finding's title or body claims a regulator / standards-body / government
// action, at least one ref must resolve to an authority-owned domain. If no
// primary source is present, we downgrade: SIGNAL → WATCH, WATCH → UNVERIFIED,
// and cap confidence at 2. This guarantees the rule even when the model fails
// to follow the prompt instruction.

// Authority-owned domain suffixes. Matched against the hostname of each ref URL.
// Additive: err on the side of admitting too few domains rather than too many —
// a secondary source getting miscategorised as primary is the failure mode.
var AUTHORITY_DOMAINS = [
  // US federal
  'fda.gov', 'sec.gov', 'federalregister.gov', 'cfpb.gov', 'hhs.gov',
  'cms.gov', 'nist.gov', 'treasury.gov', 'whitehouse.gov', 'congress.gov',
  'gao.gov', 'fdic.gov', 'federalreserve.gov', 'dol.gov', 'uspto.gov',
  // US insurance / state
  'naic.org', 'ncoil.org',
  // UK / EU
  'fca.org.uk', 'bankofengland.co.uk', 'gov.uk', 'parliament.uk',
  'eiopa.europa.eu', 'europa.eu', 'ec.europa.eu', 'esma.europa.eu',
  'ebi.europa.eu', 'eba.europa.eu',
  // International standards / multilaterals
  'iaisweb.org', 'bis.org', 'fsb.org', 'oecd.org', 'imf.org',
  'iso.org', 'ieee.org', 'ietf.org',
  // Canada / Australia / major jurisdictions
  'osfi-bsif.gc.ca', 'apra.gov.au', 'asic.gov.au', 'canada.ca'
];

// Trigger keywords that mark a finding as a "regulator / government claim".
// Case-insensitive match on title + body.
var REGULATOR_TRIGGERS = [
  'FDA', 'SEC', 'CFPB', 'NAIC', 'FCA', 'EIOPA', 'FSB', 'IAIS', 'BIS',
  'ESMA', 'EBA', 'NIST', 'HHS', 'CMS', 'Federal Register',
  'European Commission', 'EU Commission', 'ISO', 'IEEE', 'OECD',
  'Federal Reserve', 'Treasury', 'OSFI', 'APRA', 'ASIC',
  'regulator', 'regulators', 'regulatory', 'legislation', 'rule finalised',
  'rule finalized', 'rulemaking', 'guidance issued', 'directive'
];

function hostnameOf(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (_) {
    return '';
  }
}

function isAuthorityUrl(url) {
  var host = hostnameOf(url);
  if (!host) return false;
  return AUTHORITY_DOMAINS.some(function (suffix) {
    return host === suffix || host.endsWith('.' + suffix);
  });
}

function mentionsRegulator(text) {
  if (!text) return false;
  var hay = String(text).toLowerCase();
  return REGULATOR_TRIGGERS.some(function (trig) {
    return hay.indexOf(trig.toLowerCase()) !== -1;
  });
}

// Returns { hasPrimarySource, claimsRegulatorAction, downgraded, reason }
// and the (possibly downgraded) finding. Pure function — does not mutate input.
function enforce(finding) {
  var claimsRegulator = mentionsRegulator(finding.title) || mentionsRegulator(finding.body);
  if (!claimsRegulator) {
    return { finding: finding, claimsRegulatorAction: false, hasPrimarySource: null, downgraded: false };
  }

  var refs = Array.isArray(finding.refs) ? finding.refs : [];
  var hasPrimary = refs.some(function (r) { return r && isAuthorityUrl(r.url); });

  if (hasPrimary) {
    return { finding: finding, claimsRegulatorAction: true, hasPrimarySource: true, downgraded: false };
  }

  // Downgrade.
  var currentVerdict = finding.verdict || 'WATCH';
  var newVerdict = currentVerdict === 'SIGNAL' ? 'WATCH'
                 : currentVerdict === 'WATCH'  ? 'UNVERIFIED'
                 : 'UNVERIFIED';
  var newConfidence = Math.min(Number(finding.confidence) || 2, 2);

  var downgraded = Object.assign({}, finding, {
    verdict: newVerdict,
    confidence: newConfidence,
    primary_source_missing: true
  });

  return {
    finding: downgraded,
    claimsRegulatorAction: true,
    hasPrimarySource: false,
    downgraded: true,
    reason: 'claims regulator action but no authority-domain ref'
  };
}

// Batch: returns { findings: [...], downgrades: [{title, from, to, reason}, ...] }
function enforceBatch(findings) {
  var downgrades = [];
  var out = (findings || []).map(function (f) {
    var r = enforce(f);
    if (r.downgraded) {
      downgrades.push({
        title: f.title,
        from: f.verdict,
        to: r.finding.verdict,
        confidence_from: f.confidence,
        confidence_to: r.finding.confidence,
        reason: r.reason
      });
    }
    return r.finding;
  });
  return { findings: out, downgrades: downgrades };
}

module.exports = {
  AUTHORITY_DOMAINS: AUTHORITY_DOMAINS,
  REGULATOR_TRIGGERS: REGULATOR_TRIGGERS,
  isAuthorityUrl: isAuthorityUrl,
  mentionsRegulator: mentionsRegulator,
  enforce: enforce,
  enforceBatch: enforceBatch
};
