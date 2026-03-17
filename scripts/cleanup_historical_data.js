#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HISTORICAL DATA CLEANUP SCRIPT
 * Flags all historical findings that lack freshness validation
 * Run this ONCE after deploying the freshness validation system
 * ═══════════════════════════════════════════════════════════════════════════
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  process.exit(1);
}

async function supabaseCall(method, table, body, query) {
  const url = SUPABASE_URL + '/rest/v1/' + table + (query || '');
  const opts = {
    method: method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer': method === 'PATCH' ? 'return=minimal' : 'count=exact'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase ${method} ${table} ${res.status}: ${text}`);
  }
  
  if (method === 'GET') {
    const data = await res.json();
    const cr = res.headers.get('content-range') || '';
    const total = cr.includes('/') ? parseInt(cr.split('/')[1], 10) : null;
    return { data, total };
  }
  return null;
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  YNOT.NOW - Historical Data Freshness Cleanup');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  try {
    // Step 1: Count findings without freshness data
    console.log('[1/4] Counting historical findings without freshness validation...');
    const { total: totalFindings } = await supabaseCall('GET', 'findings', null, '?select=id&limit=1');
    console.log(`      Total findings in database: ${totalFindings}`);
    
    const { total: noFreshness } = await supabaseCall('GET', 'findings', null, 
      '?select=id&freshness_flag=is.null&limit=1'
    );
    console.log(`      Findings without freshness_flag: ${noFreshness || 0}`);
    
    // Step 2: Flag all historical findings as 'needs_review'
    if (noFreshness > 0) {
      console.log('\n[2/4] Flagging historical findings for review...');
      await supabaseCall('PATCH', 'findings', 
        { 
          freshness_flag: 'needs_review',
          freshness_priority: 2
        },
        '?freshness_flag=is.null'
      );
      console.log(`      ✓ ${noFreshness} findings flagged as 'needs_review'`);
    } else {
      console.log('\n[2/4] No historical findings need flagging - all have freshness data');
    }
    
    // Step 3: Count findings by freshness category
    console.log('\n[3/4] Current freshness distribution:');
    const freshQuery = await supabaseCall('GET', 'findings', null,
      '?select=freshness_flag&freshness_flag=eq.fresh&limit=1'
    );
    console.log(`      Fresh (< 7 days):       ${freshQuery.total || 0}`);
    
    const undatedQuery = await supabaseCall('GET', 'findings', null,
      '?select=freshness_flag&freshness_flag=eq.undated&limit=1'
    );
    console.log(`      Undated:                ${undatedQuery.total || 0}`);
    
    const staleQuery = await supabaseCall('GET', 'findings', null,
      '?select=freshness_flag&freshness_flag=eq.stale&limit=1'
    );
    console.log(`      Stale (> 7 days):       ${staleQuery.total || 0}`);
    
    const reviewQuery = await supabaseCall('GET', 'findings', null,
      '?select=freshness_flag&freshness_flag=eq.needs_review&limit=1'
    );
    console.log(`      Needs Review:           ${reviewQuery.total || 0}`);
    
    // Step 4: Summary
    console.log('\n[4/4] Cleanup complete!');
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  ✓ All historical findings flagged for review');
    console.log('  ✓ Future cron runs will validate source freshness');
    console.log('  ✓ Only sources from last 7 days will be accepted');
    console.log('\n  Next steps:');
    console.log('  • Run a test cron job to verify freshness validation');
    console.log('  • Monitor logs for "freshness validation" messages');
    console.log('  • Optionally: manually review flagged historical data\n');
    
  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    process.exit(1);
  }
}

main();
