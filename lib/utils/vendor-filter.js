'use strict';
// lib/utils/vendor-filter.js — Vendor-neutral title filter (hard programmatic safety net)

var VENDOR_NAMES = [
  'accenture','deloitte','mckinsey','ey ','ernst young','ernst & young','pwc','pricewaterhousecoopers','kpmg',
  'bain ','bcg','boston consulting','capgemini','cognizant','infosys','wipro','tcs','tata consultancy',
  'guidewire','duck creek','majesco','sapiens','unqork','socotra','earnix','shift technology',
  'verisk','lexisnexis','moody','cape analytics','tractable','lemonade','hippo insurance','root insurance',
  'microsoft','google','amazon','aws','ibm','oracle','salesforce','palantir','snowflake','databricks',
  'openai','anthropic','meta ','nvidia','tesla'
];

var ACTION_WORDS = ['launches','announces','unveils','releases','partners','introduces',
  'expands','acquires','rolls out','deploys','reports','predicts','projects'];

/**
 * Check if a title is vendor-centric. Returns the vendor name if blocked, null otherwise.
 */
function isVendorCentricTitle(title) {
  var lower = String(title || '').toLowerCase();
  for (var i = 0; i < VENDOR_NAMES.length; i++) {
    var v = VENDOR_NAMES[i].trim();
    // Check if title STARTS with the vendor name
    if (lower.indexOf(v) === 0) return v;
    // Check patterns like "Vendor launches...", "Vendor's new..."
    for (var j = 0; j < ACTION_WORDS.length; j++) {
      if (lower.indexOf(v + ' ' + ACTION_WORDS[j]) !== -1) return v;
    }
    if (lower.indexOf(v + "'s ") !== -1 && lower.indexOf(v + "'s ") < 3) return v;
  }
  return null;
}

/**
 * Filter findings, removing vendor-centric titles.
 * @param {Array} findings - Array of finding objects
 * @param {string} logPrefix - Log prefix (default '[YNOT]')
 * @returns {Array} - Filtered findings
 */
function applyVendorFilter(findings, logPrefix) {
  var prefix = logPrefix || '[YNOT]';
  return findings.filter(function(f) {
    var vendor = isVendorCentricTitle(f.title);
    if (vendor) {
      console.warn(prefix + ' VENDOR FILTER: blocked finding "' + f.title + '" (vendor-centric: ' + vendor + ')');
      return false;
    }
    return true;
  });
}

module.exports = {
  VENDOR_NAMES: VENDOR_NAMES,
  isVendorCentricTitle: isVendorCentricTitle,
  applyVendorFilter: applyVendorFilter
};
