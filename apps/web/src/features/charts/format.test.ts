import { describe, expect, it } from 'vitest';
import { formatDay, formatShare } from './format';

describe('formatShare', () => {
  it.each([
    [0.5, '50%'],
    [0.456, '46%'],
    [1, '100%'],
    [0.01, '1%'],
    [0.004, '<1%'],
    [0.0001, '<1%'],
    [0, '0%'],
  ])('%d is %s', (share, expected) => {
    expect(formatShare(share)).toBe(expected);
  });
});

describe('formatDay', () => {
  it('writes the month in short form and the day without a leading zero', () => {
    expect(formatDay('2026-11-02')).toBe('Nov 2');
    expect(formatDay('2026-12-31')).toBe('Dec 31');
    expect(formatDay('2024-02-29')).toBe('Feb 29');
  });
});
