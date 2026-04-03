'use strict';
// lib/services/supabase.js — Supabase REST client

var SUPABASE_URL = process.env.SUPABASE_URL || '';
var SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

/**
 * Generic Supabase REST call.
 * @param {string} method - HTTP method (GET, POST, DELETE, PATCH)
 * @param {string} table  - Table name
 * @param {*}      body   - Request body (POST/PATCH)
 * @param {string} query  - Query string (e.g. '?select=id&limit=10')
 * @param {object} opts   - Extra options: { prefer }
 * @returns {Promise<*>}
 */
async function supabaseCall(method, table, body, query, opts) {
  var url = SUPABASE_URL + '/rest/v1/' + table + (query || '');
  var prefer = (opts && opts.prefer) || (method === 'POST' ? 'return=minimal' : '');
  var fetchOpts = {
    method: method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer': prefer
    }
  };
  if (body) fetchOpts.body = JSON.stringify(body);
  var r = await fetch(url, fetchOpts);
  if (!r.ok) {
    var t = await r.text().catch(function() { return ''; });
    var err = new Error('Supabase ' + method + ' ' + table + ' ' + r.status + ': ' + t);
    err.status = r.status;
    err.table = table;
    throw err;
  }
  if (method === 'GET') return r.json();
  return null;
}

/**
 * Supabase GET with count support (returns { data, total }).
 */
async function supabaseGetWithCount(table, query) {
  var url = SUPABASE_URL + '/rest/v1/' + table + (query || '');
  var r = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer': 'count=exact'
    }
  });
  if (!r.ok) throw new Error('Supabase ' + r.status);
  var data = await r.json();
  var cr = r.headers.get('content-range') || '';
  var total = cr.includes('/') ? parseInt(cr.split('/')[1], 10) : null;
  return { data: data, total: total };
}

/**
 * Supabase upsert (POST with merge-duplicates).
 */
async function supabaseUpsert(table, rows) {
  var url = SUPABASE_URL + '/rest/v1/' + table;
  var r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(rows)
  });
  if (!r.ok) {
    var t = await r.text().catch(function() { return ''; });
    throw new Error('Supabase upsert ' + table + ' ' + r.status + ': ' + t);
  }
  return null;
}

module.exports = { supabaseCall: supabaseCall, supabaseGetWithCount: supabaseGetWithCount, supabaseUpsert: supabaseUpsert };
