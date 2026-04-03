import { describe, it, expect } from 'vitest';
import { normalizeVerdict, normalizeRisk, normalizeTopicKey, buildFindingRow } from '../lib/utils/normalizers.js';

describe('normalizeVerdict', () => {
  it('maps SIGNAL correctly', () => {
    expect(normalizeVerdict('SIGNAL')).toBe('SIGNAL');
    expect(normalizeVerdict('signal')).toBe('SIGNAL');
    expect(normalizeVerdict('Signal')).toBe('SIGNAL');
  });

  it('maps UNVERIFIED correctly', () => {
    expect(normalizeVerdict('UNVERIFIED')).toBe('UNVERIFIED');
    expect(normalizeVerdict('unverified')).toBe('UNVERIFIED');
  });

  it('maps legacy NOISE to UNVERIFIED', () => {
    expect(normalizeVerdict('NOISE')).toBe('UNVERIFIED');
    expect(normalizeVerdict('noise')).toBe('UNVERIFIED');
  });

  it('defaults to WATCH for unknown verdicts', () => {
    expect(normalizeVerdict('WATCH')).toBe('WATCH');
    expect(normalizeVerdict('watch')).toBe('WATCH');
    expect(normalizeVerdict('something')).toBe('WATCH');
    expect(normalizeVerdict('')).toBe('WATCH');
    expect(normalizeVerdict(null)).toBe('WATCH');
    expect(normalizeVerdict(undefined)).toBe('WATCH');
  });
});

describe('normalizeRisk', () => {
  it('maps low, medium, high correctly', () => {
    expect(normalizeRisk('low')).toBe('low');
    expect(normalizeRisk('LOW')).toBe('low');
    expect(normalizeRisk('high')).toBe('high');
    expect(normalizeRisk('HIGH')).toBe('high');
    expect(normalizeRisk('medium')).toBe('medium');
  });

  it('defaults to medium for unknown values', () => {
    expect(normalizeRisk('critical')).toBe('medium');
    expect(normalizeRisk('')).toBe('medium');
    expect(normalizeRisk(null)).toBe('medium');
  });
});

describe('normalizeTopicKey', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeTopicKey('AI Claims Automation')).toBe('ai-claims-automation');
  });

  it('removes stopwords', () => {
    expect(normalizeTopicKey('The Rise of AI in Insurance')).toBe('rise-ai-insurance');
  });

  it('limits to 80 characters', () => {
    var longTitle = 'a'.repeat(100);
    expect(normalizeTopicKey(longTitle).length).toBeLessThanOrEqual(80);
  });

  it('handles empty/null input', () => {
    expect(normalizeTopicKey('')).toBe('');
    expect(normalizeTopicKey(null)).toBe('');
  });
});

describe('buildFindingRow', () => {
  it('builds a complete row with defaults', () => {
    var finding = {
      mind_id: 'scout', mind_name: 'Scout', mind_icon: 'Scout',
      title: 'Test Finding', verdict: 'SIGNAL', body: 'Test body',
      domain: 'P&C', confidence: 4, trl: 7,
      regulatoryRisk: 'low', refs: [{ label: 'src', url: 'https://example.com' }]
    };
    var row = buildFindingRow(finding, 'run_123', '2026-04-01');
    expect(row.run_id).toBe('run_123');
    expect(row.run_date).toBe('2026-04-01');
    expect(row.verdict).toBe('SIGNAL');
    expect(row.confidence).toBe(4);
    expect(row.regions).toEqual(['Global']);
    expect(row.signal_status).toBe('NEW');
    expect(row.freshness_flag).toBe('undated');
  });

  it('clamps confidence to 1-5 range', () => {
    var f = { confidence: 10, mind_id: 'x', mind_name: 'x', mind_icon: 'x', title: 't', body: 'b', domain: 'd' };
    expect(buildFindingRow(f, 'r', 'd').confidence).toBe(5);
    // parseInt(0) || 3 = 3 (0 is falsy), so 0 defaults to 3
    f.confidence = 0;
    expect(buildFindingRow(f, 'r', 'd').confidence).toBe(3);
    // Negative values get clamped to 1
    f.confidence = -5;
    expect(buildFindingRow(f, 'r', 'd').confidence).toBe(1);
  });

  it('normalizes legacy NOISE verdict', () => {
    var f = { verdict: 'NOISE', mind_id: 'x', mind_name: 'x', mind_icon: 'x', title: 't', body: 'b', domain: 'd' };
    expect(buildFindingRow(f, 'r', 'd').verdict).toBe('UNVERIFIED');
  });
});
