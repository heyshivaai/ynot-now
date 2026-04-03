'use strict';
// lib/utils/url-utils.js — URL date extraction and verification

/**
 * Extract a date from URL patterns like /2026/03/23/ or /2026-03-23/ or /20260323/
 * @param {string} url
 * @returns {string|null} - Date string in YYYY-MM-DD format, or null
 */
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
      var dateStr2 = match[1] + '-' + match[2] + '-' + match[3];
      var d2 = new Date(dateStr2);
      if (!isNaN(d2.getTime())) return dateStr2;
    }
    // Pattern 3: month names like /march-2026/ or /2026/march/
    var months = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
    match = url.toLowerCase().match(/\/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\/-](\d{4})/);
    if (match) return match[2] + '-' + months[match[1]] + '-01';
    match = url.toLowerCase().match(/\/(\d{4})[\/-](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/);
    if (match) return match[1] + '-' + months[match[2]] + '-01';
  } catch(e) { /* ignore parse errors */ }
  return null;
}

/**
 * Check if a date string is within the last N days.
 */
function isWithinDays(dateStr, days) {
  if (!dateStr) return false;
  try {
    var d = new Date(dateStr);
    var cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    return d.getTime() >= cutoff;
  } catch(e) { return false; }
}

/**
 * HEAD-check refs, remove dead links. Falls back to GET if HEAD fails.
 * Returns original refs if ALL are dead (better than empty).
 * @param {Array} refs - Array of { label, url, ... }
 * @returns {Promise<Array>} - Verified refs
 */
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
  return live.length > 0 ? live : refs; // keep originals if all dead
}

module.exports = {
  extractDateFromUrl: extractDateFromUrl,
  isWithinDays: isWithinDays,
  verifyRefs: verifyRefs
};
