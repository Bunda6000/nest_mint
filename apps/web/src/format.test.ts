import { describe, expect, it } from 'vitest';
import { formatMkd, formatRate } from './format';

describe('format', () => {
  it('formats denars', () => {
    expect(formatMkd(127088)).toBe('127,088 MKD');
  });

  it('formats savings rate and the empty case', () => {
    expect(formatRate(0.4377)).toBe('43.8%');
    expect(formatRate(null)).toBe('—');
  });
});
