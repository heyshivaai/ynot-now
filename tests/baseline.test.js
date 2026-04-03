import { describe, it, expect } from 'vitest';
import { collectRunMetrics, checkBaseline } from '../lib/metrics/baseline.js';

describe('collectRunMetrics', () => {
  it('collects volume metrics correctly', () => {
    var findings = [
      { verdict: 'SIGNAL', confidence: 4, freshness_flag: 'fresh', refs: [{ url: 'a' }], signal_status: 'NEW' },
      { verdict: 'WATCH', confidence: 3, freshness_flag: 'undated', refs: [{ url: 'b' }, { url: 'c' }], signal_status: 'EMERGING' },
      { verdict: 'UNVERIFIED', confidence: 2, freshness_flag: 'stale', refs: [], signal_status: 'NEW' }
    ];
    var metrics = collectRunMetrics({
      runId: 'test_run', runDate: '2026-04-01', phase: 1,
      findings: findings, errors: [], durationMs: 5000
    });

    expect(metrics.total_findings).toBe(3);
    expect(metrics.total_errors).toBe(0);
    expect(metrics.verdict_distribution.SIGNAL).toBe(1);
    expect(metrics.verdict_distribution.WATCH).toBe(1);
    expect(metrics.verdict_distribution.UNVERIFIED).toBe(1);
  });

  it('calculates quality metrics correctly', () => {
    var findings = [
      { verdict: 'SIGNAL', confidence: 5, freshness_flag: 'fresh', refs: [{ url: 'a' }, { url: 'b' }], signal_status: 'NEW' },
      { verdict: 'SIGNAL', confidence: 3, freshness_flag: 'fresh', refs: [{ url: 'c' }], signal_status: 'NEW' }
    ];
    var metrics = collectRunMetrics({
      runId: 'r', runDate: 'd', phase: 1,
      findings: findings, errors: [], durationMs: 1000
    });

    expect(metrics.avg_confidence).toBe(4);
    expect(metrics.fresh_rate).toBe(1);
    expect(metrics.avg_refs_per_finding).toBe(1.5);
    expect(metrics.findings_with_refs_rate).toBe(1);
  });

  it('handles empty findings', () => {
    var metrics = collectRunMetrics({
      runId: 'r', runDate: 'd', phase: 1,
      findings: [], errors: [{ mind: 'scout', error: 'timeout' }], durationMs: 100
    });
    expect(metrics.total_findings).toBe(0);
    expect(metrics.total_errors).toBe(1);
    expect(metrics.avg_confidence).toBe(0);
    expect(metrics.fresh_rate).toBe(0);
  });
});

describe('checkBaseline', () => {
  var baseline = {
    total_findings: 20,
    avg_confidence: 3.5,
    fresh_rate: 0.6,
    total_errors: 0
  };

  it('returns no warnings when within baseline', () => {
    var current = { total_findings: 18, avg_confidence: 3.3, fresh_rate: 0.55, total_errors: 0 };
    expect(checkBaseline(current, baseline)).toHaveLength(0);
  });

  it('warns when finding count drops significantly', () => {
    var current = { total_findings: 8, avg_confidence: 3.5, fresh_rate: 0.6, total_errors: 0 };
    var warnings = checkBaseline(current, baseline);
    expect(warnings.some(w => w.includes('Finding count'))).toBe(true);
  });

  it('warns when confidence drops significantly', () => {
    var current = { total_findings: 20, avg_confidence: 2.0, fresh_rate: 0.6, total_errors: 0 };
    var warnings = checkBaseline(current, baseline);
    expect(warnings.some(w => w.includes('confidence'))).toBe(true);
  });

  it('warns when fresh rate drops significantly', () => {
    var current = { total_findings: 20, avg_confidence: 3.5, fresh_rate: 0.2, total_errors: 0 };
    var warnings = checkBaseline(current, baseline);
    expect(warnings.some(w => w.includes('Fresh rate'))).toBe(true);
  });

  it('warns when errors appear', () => {
    var current = { total_findings: 20, avg_confidence: 3.5, fresh_rate: 0.6, total_errors: 2 };
    var warnings = checkBaseline(current, baseline);
    expect(warnings.some(w => w.includes('errors'))).toBe(true);
  });

  it('returns empty when no baseline exists', () => {
    expect(checkBaseline({}, null)).toHaveLength(0);
  });
});
