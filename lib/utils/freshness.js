'use strict';
// lib/utils/freshness.js — LAYER 3: Programmatic freshness validation

/**
 * Validate source freshness across findings.
 * Filters stale refs, assigns freshness_flag and freshness_priority.
 * Removes findings with no remaining refs.
 *
 * @param {Array}  findings   - Array of finding objects with refs
 * @param {string} logPrefix  - Log prefix (default '[YNOT]')
 * @returns {Array} - Findings with freshness metadata attached
 */
function validateSourceFreshness(findings, logPrefix) {
  var prefix = logPrefix || '[YNOT]';
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
            console.warn(prefix + ' Removed stale ref (' + ref.published_date + '): ' + ref.url);
          }
        } catch(e) {
          undatedRefs.push(ref); // Invalid date format
        }
      } else {
        undatedRefs.push(ref);
      }
    });

    // Determine freshness: 1=fresh, 2=undated, 3=stale
    var priority = 3;
    var flag = 'stale';

    if (freshRefs.length > 0) {
      priority = 1;
      flag = 'fresh';
    } else if (undatedRefs.length > 0 && staleRefs.length === 0) {
      priority = 2;
      flag = 'undated';
    }

    // Keep fresh + undated, discard stale
    var keptRefs = freshRefs.concat(undatedRefs);

    return Object.assign({}, f, {
      refs: keptRefs,
      source_published_date: newestDate,
      freshness_flag: flag,
      freshness_priority: priority
    });
  }).filter(function(f) {
    if (f.refs.length === 0) {
      console.warn(prefix + ' Removed finding (no fresh refs): ' + f.title);
      return false;
    }
    return true;
  });
}

module.exports = { validateSourceFreshness: validateSourceFreshness };
