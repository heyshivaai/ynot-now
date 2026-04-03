import { describe, it, expect } from 'vitest';
import { validateSourceFreshness } from '../lib/utils/freshness.js';

function makeRef(url, publishedDate) {
  return { label: 'test', url: url, published_date: publishedDate || null };
}

function makeFinding(title, refs) {
  return { title: title, refs: refs, verdict: 'SIGNAL', confidence: 4 };
}

describe('validateSourceFreshness', () => {
  it('keeps findings with fresh refs and marks as fresh', () => {
    var yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    var findings = [makeFinding('Fresh Finding', [makeRef('https://example.com', yesterday)])];
    var result = validateSourceFreshness(findings);
    expect(result).toHaveLength(1);
    expect(result[0].freshness_flag).toBe('fresh');
    expect(result[0].freshness_priority).toBe(1);
    expect(result[0].source_published_date).toBe(yesterday);
  });

  it('removes stale refs but keeps undated refs', () => {
    var twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    var findings = [makeFinding('Mixed Finding', [
      makeRef('https://stale.com', twoWeeksAgo),
      makeRef('https://undated.com', null)
    ])];
    var result = validateSourceFreshness(findings);
    expect(result).toHaveLength(1);
    expect(result[0].refs).toHaveLength(1);
    expect(result[0].refs[0].url).toBe('https://undated.com');
    // When stale refs existed alongside undated, the flag is 'stale' (staleRefs.length > 0)
    expect(result[0].freshness_flag).toBe('stale');
    expect(result[0].freshness_priority).toBe(3);
  });

  it('removes findings with zero remaining refs', () => {
    var twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    var findings = [makeFinding('All Stale', [
      makeRef('https://old1.com', twoWeeksAgo),
      makeRef('https://old2.com', twoWeeksAgo)
    ])];
    var result = validateSourceFreshness(findings);
    expect(result).toHaveLength(0);
  });

  it('preserves undated-only findings with priority 2', () => {
    var findings = [makeFinding('Undated Finding', [
      makeRef('https://a.com'),
      makeRef('https://b.com')
    ])];
    var result = validateSourceFreshness(findings);
    expect(result).toHaveLength(1);
    expect(result[0].freshness_flag).toBe('undated');
    expect(result[0].freshness_priority).toBe(2);
  });

  it('handles empty findings array', () => {
    expect(validateSourceFreshness([])).toHaveLength(0);
  });

  it('handles findings with no refs', () => {
    var findings = [makeFinding('No Refs', [])];
    var result = validateSourceFreshness(findings);
    expect(result).toHaveLength(0);
  });
});
