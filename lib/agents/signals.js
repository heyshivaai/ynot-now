'use strict';
// lib/agents/signals.js — Signal trajectory tracking, cross-agent agreement detection, source reputation

var supabase = require('../services/supabase');
var normalizers = require('../utils/normalizers');

// ── SIGNAL TRAJECTORIES UPDATE ───────────────────────────────────────────────
async function updateSignalTrajectories(findings, runDate) {
  try {
    // Build topic map from this run
    var topics = {};
    findings.forEach(function(f) {
      var key = normalizers.normalizeTopicKey(f.title);
      if (!topics[key]) {
        topics[key] = { title: f.title, key: key, trl: f.trl, verdict: f.verdict, confidence: f.confidence, minds: [f.mind_id], domain: f.domain, regions: f.regions || ['Global'] };
      } else {
        if (topics[key].minds.indexOf(f.mind_id) === -1) topics[key].minds.push(f.mind_id);
        if (f.confidence > topics[key].confidence) {
          topics[key].confidence = f.confidence;
          topics[key].trl = f.trl;
          topics[key].verdict = f.verdict;
        }
      }
    });

    // Fetch existing trajectories
    var existingData = [];
    try {
      existingData = await supabase.supabaseCall('GET', 'signal_trajectories', null, '?select=id,topic_key,appearances,trajectory_data,current_trl,first_seen&limit=500');
    } catch(e) {
      console.warn('[YNOT] signal_trajectories table may not exist yet: ' + e.message);
      return;
    }
    var existingMap = {};
    existingData.forEach(function(row) { existingMap[row.topic_key] = row; });

    var upserts = [];
    Object.keys(topics).forEach(function(key) {
      var t = topics[key];
      var existing = existingMap[key];
      var snapshot = { date: runDate, trl: t.trl, verdict: t.verdict, confidence: t.confidence, minds: t.minds };

      if (existing) {
        var trajData = existing.trajectory_data || [];
        trajData.push(snapshot);
        var appearances = (existing.appearances || 0) + 1;
        var trlVelocity = trajData.length >= 2 ? (t.trl - trajData[0].trl) / trajData.length : 0;
        var crossAgentCount = t.minds.length;
        var compoundScore = Math.round(((Math.min(appearances, 10) / 10) * 0.3 + (t.confidence / 5) * 0.2 + (Math.min(crossAgentCount, 4) / 4) * 0.25 + (Math.max(0, Math.min(trlVelocity + 0.5, 1))) * 0.25) * 100);

        upserts.push({
          id: existing.id, topic_key: key, title: t.title, domain: t.domain, regions: t.regions,
          current_trl: t.trl, current_verdict: t.verdict, current_confidence: t.confidence,
          last_seen: runDate, first_seen: existing.first_seen, appearances: appearances,
          cross_agent_count: crossAgentCount, compound_score: compoundScore,
          trl_velocity: Math.round(trlVelocity * 100) / 100, trajectory_data: trajData
        });
      } else {
        upserts.push({
          topic_key: key, title: t.title, domain: t.domain, regions: t.regions,
          current_trl: t.trl, current_verdict: t.verdict, current_confidence: t.confidence,
          first_seen: runDate, last_seen: runDate, appearances: 1,
          cross_agent_count: t.minds.length,
          compound_score: Math.round(((1/10) * 0.3 + (t.confidence / 5) * 0.2 + (Math.min(t.minds.length, 4) / 4) * 0.25 + 0.5 * 0.25) * 100),
          trl_velocity: 0, trajectory_data: [snapshot]
        });
      }
    });

    if (upserts.length > 0) {
      await supabase.supabaseUpsert('signal_trajectories', upserts);
      console.log('[YNOT] Signal trajectories updated: ' + upserts.length + ' topics');
    }
  } catch(e) {
    console.warn('[YNOT] Signal trajectories update failed (non-blocking): ' + e.message);
  }
}

// ── CROSS-AGENT AGREEMENT DETECTION ──────────────────────────────────────────
async function detectCrossAgentAgreement(findings, runDate) {
  try {
    var topicMindMap = {};
    findings.forEach(function(f) {
      var words = String(f.title || '').toLowerCase().split(/\s+/).filter(function(w) { return w.length > 4; });
      findings.forEach(function(f2) {
        if (f2.mind_id === f.mind_id) return;
        var words2 = String(f2.title || '').toLowerCase().split(/\s+/).filter(function(w) { return w.length > 4; });
        var overlap = words.filter(function(w) { return words2.indexOf(w) >= 0; });
        if (overlap.length >= 2) {
          var key = overlap.sort().join('-');
          if (!topicMindMap[key]) topicMindMap[key] = { topic: overlap.join(' '), minds: new Set(), findings: [] };
          topicMindMap[key].minds.add(f.mind_id);
          topicMindMap[key].minds.add(f2.mind_id);
          topicMindMap[key].findings.push(f.title);
        }
      });
    });

    var agreements = Object.keys(topicMindMap)
      .filter(function(k) { return topicMindMap[k].minds.size >= 2; })
      .map(function(k) {
        var a = topicMindMap[k];
        return {
          run_date: runDate,
          topic_key: k,
          topic_label: a.topic,
          agent_count: a.minds.size,
          agents: Array.from(a.minds),
          finding_titles: a.findings.slice(0, 5),
          agreement_strength: Math.min(a.minds.size / 4, 1)
        };
      })
      .sort(function(a, b) { return b.agent_count - a.agent_count; })
      .slice(0, 10);

    if (agreements.length > 0) {
      await supabase.supabaseCall('POST', 'cross_agent_agreements', agreements).catch(function(e) {
        console.warn('[YNOT] cross_agent_agreements table not ready: ' + e.message);
      });
      console.log('[YNOT] Cross-agent agreements detected: ' + agreements.length);
    }
  } catch(e) {
    console.warn('[YNOT] Cross-agent agreement detection failed: ' + e.message);
  }
}

// ── RAW INTELLIGENCE STORAGE ─────────────────────────────────────────────────
async function storeRawIntelligence(mindId, queries, results, runId, runDate) {
  try {
    var row = {
      run_id: runId,
      run_date: runDate,
      mind_id: mindId,
      search_queries: queries,
      result_count: results.length,
      results: results.slice(0, 15).map(function(r) {
        return { title: r.title, url: r.url, content: r.content, published_date: r.published_date };
      })
    };
    await supabase.supabaseCall('POST', 'intelligence_raw', [row]).catch(function(e) {
      console.warn('[YNOT] intelligence_raw table not ready: ' + e.message);
    });
  } catch(e) {
    console.warn('[YNOT] Raw intel storage failed: ' + e.message);
  }
}

// ── SOURCE REPUTATION ────────────────────────────────────────────────────────
async function recordSourceReputation(findings) {
  try {
    var highQuality = findings.filter(function(f) {
      return (f.verdict === 'SIGNAL' || f.verdict === 'WATCH') && f.confidence >= 4;
    });
    if (highQuality.length === 0) return;
    var domains = {};
    highQuality.forEach(function(f) {
      (f.refs || []).forEach(function(ref) {
        if (!ref.url) return;
        try {
          var d = new URL(ref.url).hostname.replace('www.', '');
          domains[d] = (domains[d] || 0) + 1;
        } catch(e) {}
      });
    });
    var rows = Object.keys(domains).map(function(d) {
      return { domain: d, quality_hits: domains[d], last_seen: new Date().toISOString().split('T')[0], agent_id: findings[0] && findings[0].mind_id };
    });
    if (rows.length > 0) {
      await supabase.supabaseCall('POST', 'source_reputation', rows).catch(function(e) {
        console.warn('[YNOT] source_reputation table not ready: ' + e.message);
      });
    }
  } catch(e) {
    console.warn('[YNOT] Source reputation recording failed: ' + e.message);
  }
}

// ── AGENT MEMORY ─────────────────────────────────────────────────────────────
async function fetchAgentMemory(mindId) {
  try {
    var fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    var data = await supabase.supabaseCall('GET', 'findings', null,
      '?mind_id=eq.' + mindId +
      '&run_date=gte.' + fourWeeksAgo +
      '&order=run_date.desc' +
      '&select=title,verdict,confidence,run_date,trl' +
      '&limit=20'
    );
    if (!data || data.length === 0) return null;
    var byWeek = {};
    data.forEach(function(f) {
      if (!byWeek[f.run_date]) byWeek[f.run_date] = [];
      byWeek[f.run_date].push(f.title + ' [' + f.verdict + ', confidence ' + f.confidence + ', TRL ' + f.trl + ']');
    });
    return Object.keys(byWeek).sort().reverse().map(function(date) {
      return 'Week of ' + date + ':\n' + byWeek[date].join('\n');
    }).join('\n\n');
  } catch(e) {
    console.warn('[YNOT] Memory fetch failed for ' + mindId + ': ' + e.message);
    return null;
  }
}

module.exports = {
  updateSignalTrajectories: updateSignalTrajectories,
  detectCrossAgentAgreement: detectCrossAgentAgreement,
  storeRawIntelligence: storeRawIntelligence,
  recordSourceReputation: recordSourceReputation,
  fetchAgentMemory: fetchAgentMemory
};
