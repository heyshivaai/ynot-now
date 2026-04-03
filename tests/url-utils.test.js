import { describe, it, expect } from 'vitest';
import { extractDateFromUrl, isWithinDays } from '../lib/utils/url-utils.js';

describe('extractDateFromUrl', () => {
  it('extracts /YYYY/MM/DD/ pattern', () => {
    expect(extractDateFromUrl('https://example.com/2026/03/23/article')).toBe('2026-03-23');
  });

  it('extracts /YYYY-MM-DD/ pattern', () => {
    expect(extractDateFromUrl('https://example.com/2026-03-23/post')).toBe('2026-03-23');
  });

  it('extracts /YYYYMMDD/ pattern', () => {
    expect(extractDateFromUrl('https://example.com/20260323/article/')).toBe('2026-03-23');
  });

  it('extracts /march-2026/ pattern', () => {
    var result = extractDateFromUrl('https://example.com/march-2026/article');
    expect(result).toBe('2026-03-01');
  });

  it('extracts /2026/march/ pattern', () => {
    var result = extractDateFromUrl('https://example.com/2026/march/article');
    expect(result).toBe('2026-03-01');
  });

  it('returns null for URLs without dates', () => {
    expect(extractDateFromUrl('https://example.com/article/ai-insurance')).toBeNull();
    expect(extractDateFromUrl('https://example.com')).toBeNull();
  });

  it('returns null for invalid dates', () => {
    expect(extractDateFromUrl('https://example.com/2026/99/99/article')).toBeNull();
  });

  it('handles null/empty input', () => {
    expect(extractDateFromUrl(null)).toBeNull();
    expect(extractDateFromUrl('')).toBeNull();
  });
});

describe('isWithinDays', () => {
  it('returns true for dates within range', () => {
    var yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    expect(isWithinDays(yesterday, 7)).toBe(true);
  });

  it('returns false for dates outside range', () => {
    var twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    expect(isWithinDays(twoWeeksAgo, 7)).toBe(false);
  });

  it('returns false for null/empty', () => {
    expect(isWithinDays(null, 7)).toBe(false);
    expect(isWithinDays('', 7)).toBe(false);
  });
});
