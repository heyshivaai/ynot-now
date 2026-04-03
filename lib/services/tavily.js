'use strict';
// lib/services/tavily.js — Tavily web search client

var TAVILY_KEY = process.env.TAVILY_API_KEY || '';
var extractDateFromUrl = require('../utils/url-utils').extractDateFromUrl;

/**
 * Search Tavily API for web results.
 * @param {string} query       - Search query
 * @param {number} maxResults  - Max results (default 5)
 * @returns {Promise<Array>}   - Array of { title, url, content, published_date }
 */
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

/**
 * Fetch results for multiple queries and deduplicate by URL.
 * @param {string[]} queries  - Array of search queries
 * @param {number} maxPerQuery - Max results per query (default 4)
 * @returns {Promise<Array>}  - Deduplicated results
 */
async function fetchAndDedupeResults(queries, maxPerQuery) {
  var allResults = await Promise.all(queries.map(function(q) { return tavilySearch(q, maxPerQuery || 4); }));
  var seen = {}; var deduped = [];
  allResults.forEach(function(results) {
    results.forEach(function(item) {
      if (item.url && !seen[item.url]) { seen[item.url] = true; deduped.push(item); }
    });
  });
  return deduped;
}

module.exports = { tavilySearch: tavilySearch, fetchAndDedupeResults: fetchAndDedupeResults };
