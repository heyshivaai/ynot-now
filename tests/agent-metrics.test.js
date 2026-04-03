import { describe, it, expect } from 'vitest';
import { collectAgentMetrics, collectAllAgentMetrics } from '../lib/metrics/agent-metrics.js';

describe('collectAgentMetrics', () => {
  it('collects full metrics for a successful agent', () => {
    var findings = [
      { verdict: 'SIGNAL', confidence: 5, freshness_flag: 'fresh', refs: [{ url: 'a' }, { url: 'b' }], trl: 7, signal_status: 'NEW', domain: 'P&C', subdomain: 'Claims' },
      { verdict: 'WATCH', confidence: 3, freshness_flag: 'undated', refs: [{ url: 'c' }], trl: 5, signal_status: 'EMERGING', domain: 'P&C', subdomain: 'Underwriting' },
      { verdict: 'SIGNAL', confidence: 4, freshness_flag: 'fresh', refs: [{ url: 'd' }], trl: 8, signal_status: 'CONFIRMED', domain: 'P&C', subdomain: 'Claims' }
    ];
    var m = collectAgentMetrics({
      mindId: 'scout', mindName: 'Scout',
      runId: 'run_1', runDate: '2026-04-01', phase: 1,
      findings: findings, durationMs: 12000, tavilyResults: 10, queryCount: 4
    });

    expect(m.mind_id).toBe('scout');
    expect(m.status).toBe('success');
    expect(m.finding_count).toBe(3);
    expect(m.signal_count).toBe(2);
    expect(m.watch_count).toBe(1);
    expect(m.unverified_count).toBe(0);
    expect(m.avg_confidence).toBe(4);
    expect(m.avg_trl).toBeCloseTo(6.67, 1);
    expect(m.fresh_count).toBe(2);
    expect(m.undated_count).toBe(1);
    expect(m.fresh_rate).toBeCloseTo(0.67, 1);
    expect(m.total_refs).toBe(4);
    expect(m.avg_refs_per_finding).toBeCloseTo(1.33, 1);
    expect(m.tavily_efficiency).toBe(0.3);
    expect(m.new_signals).toBe(1);
    expect(m.emerging_signals).toBe(1);
    expect(m.confirmed_signals).toBe(1);
    expect(m.unique_domains).toBe(2);
    expect(m.duration_ms).toBe(12000);
  });

  it('handles errored agent', () => {
    var m = collectAgentMetrics({
      mindId: 'lex', mindName: 'Lex',
      runId: 'run_1', runDate: '2026-04-01', phase: 1,
      findings: [], durationMs: 500, tavilyResults: 0, queryCount: 4,
      error: 'Claude 429: rate limited'
    });

    expect(m.status).toBe('error');
    expect(m.error_message).toBe('Claude 429: rate limited');
    expect(m.finding_count).toBe(0);
    expect(m.avg_confidence).toBe(0);
    expect(m.tavily_efficiency).toBe(0);
  });

  it('handles empty findings (no error)', () => {
    var m = collectAgentMetrics({
      mindId: 'terra', mindName: 'Terra',
      runId: 'run_1', runDate: '2026-04-01', phase: 1,
      findings: [], durationMs: 8000, tavilyResults: 5, queryCount: 4
    });

    expect(m.status).toBe('empty');
    expect(m.finding_count).toBe(0);
    expect(m.tavily_result_count).toBe(5);
    expect(m.tavily_efficiency).toBe(0);
  });
});

describe('collectAllAgentMetrics', () => {
  it('groups findings by mind_id and includes errored agents', () => {
    var findings = [
      { mind_id: 'scout', mind_name: 'Scout', verdict: 'SIGNAL', confidence: 4, freshness_flag: 'fresh', refs: [], trl: 7, signal_status: 'NEW', domain: 'P&C' },
      { mind_id: 'scout', mind_name: 'Scout', verdict: 'WATCH', confidence: 3, freshness_flag: 'undated', refs: [], trl: 5, signal_status: 'NEW', domain: 'P&C' },
      { mind_id: 'vita', mind_name: 'Vita', verdict: 'SIGNAL', confidence: 5, freshness_flag: 'fresh', refs: [{ url: 'x' }], trl: 8, signal_status: 'NEW', domain: 'Life' }
    ];
    var perAgent = {
      scout: { durationMs: 10000, tavilyResults: 8, findings: 2, queries: 4 },
      vita: { durationMs: 12000, tavilyResults: 6, findings: 1, queries: 4 }
    };
    var errors = [{ mind: 'lex', error: 'timeout' }];

    var rows = collectAllAgentMetrics(findings, perAgent, errors, 'run_1', '2026-04-01', 1);

    expect(rows).toHaveLength(3); // scout, vita, lex
    var scout = rows.find(function(r) { return r.mind_id === 'scout'; });
    var vita = rows.find(function(r) { return r.mind_id === 'vita'; });
    var lex = rows.find(function(r) { return r.mind_id === 'lex'; });

    expect(scout.finding_count).toBe(2);
    expect(scout.signal_count).toBe(1);
    expect(vita.finding_count).toBe(1);
    expect(vita.avg_confidence).toBe(5);
    expect(lex.status).toBe('error');
    expect(lex.error_message).toBe('timeout');
  });

  it('handles all agents erroring', () => {
    var errors = [
      { mind: 'null', error: 'Claude 500' },
      { mind: 'weave', error: 'timeout' }
    ];
    var rows = collectAllAgentMetrics([], {}, errors, 'run_1', '2026-04-01', 2);
    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe('error');
    expect(rows[1].status).toBe('error');
  });
});
