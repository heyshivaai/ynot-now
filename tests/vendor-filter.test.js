import { describe, it, expect } from 'vitest';
import { isVendorCentricTitle, applyVendorFilter } from '../lib/utils/vendor-filter.js';

describe('isVendorCentricTitle', () => {
  it('blocks titles starting with vendor names', () => {
    expect(isVendorCentricTitle('Microsoft unveils new AI tool')).toBeTruthy();
    expect(isVendorCentricTitle('Google launches insurance platform')).toBeTruthy();
    expect(isVendorCentricTitle('Accenture expands AI consulting')).toBeTruthy();
    expect(isVendorCentricTitle('OpenAI releases GPT-5')).toBeTruthy();
  });

  it('blocks vendor + action patterns anywhere in title', () => {
    expect(isVendorCentricTitle('New: IBM announces AI claims tool')).toBeTruthy();
    expect(isVendorCentricTitle('Breaking: Guidewire launches ClaimCenter AI')).toBeTruthy();
  });

  it('blocks vendor possessive patterns at start', () => {
    expect(isVendorCentricTitle("McKinsey's new report on insurance")).toBeTruthy();
    expect(isVendorCentricTitle("Deloitte's AI strategy")).toBeTruthy();
  });

  it('allows vendor-neutral market-level titles', () => {
    expect(isVendorCentricTitle('AI claims automation enters mainstream adoption')).toBeNull();
    expect(isVendorCentricTitle('Parametric insurance models gain traction in APAC')).toBeNull();
    expect(isVendorCentricTitle('Insurance carriers adopt LLMs for underwriting')).toBeNull();
  });

  it('handles edge cases', () => {
    expect(isVendorCentricTitle('')).toBeNull();
    expect(isVendorCentricTitle(null)).toBeNull();
  });
});

describe('applyVendorFilter', () => {
  it('removes vendor-centric findings', () => {
    var findings = [
      { title: 'Microsoft launches insurance AI' },
      { title: 'AI underwriting adoption accelerates globally' },
      { title: 'Guidewire releases new claims module' }
    ];
    var filtered = applyVendorFilter(findings);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe('AI underwriting adoption accelerates globally');
  });

  it('preserves all findings when none are vendor-centric', () => {
    var findings = [
      { title: 'Climate risk models improve accuracy' },
      { title: 'Regulatory sandbox programs expand in EU' }
    ];
    expect(applyVendorFilter(findings)).toHaveLength(2);
  });

  it('handles empty array', () => {
    expect(applyVendorFilter([])).toHaveLength(0);
  });
});
