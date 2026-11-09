import { describe, expect, it } from 'vitest';
import { amountChangeView, formatAmount, formatRatio, rateChangeView } from './kpi';

describe('formatAmount', () => {
  it('shows denars as they are', () => {
    expect(formatAmount(146_308, 'MKD', '2025-01')).toBe('146,308 MKD');
    expect(formatAmount(0, 'MKD', '2025-01')).toBe('0 MKD');
    expect(formatAmount(-2_500, 'MKD', '2025-01')).toBe('-2,500 MKD');
  });

  it('shows euros at the rate of the month (61.5 by default)', () => {
    expect(formatAmount(146_308, 'EUR', '2025-01')).toBe('€2,378.99');
    expect(formatAmount(0, 'EUR', '2025-01')).toBe('€0.00');
    expect(formatAmount(-2_500, 'EUR', '2025-01')).toBe('-€40.65');
  });
});

describe('formatRatio', () => {
  it.each([
    [0.08, '+8%'],
    [-0.177, '−17.7%'],
    [1.5, '+150%'],
    [-1, '−100%'],
    [0.1234, '+12.3%'],
    [0.00001, '0%'],
    [-0.00001, '0%'],
    [0, '0%'],
  ])('%d is %s', (ratio, text) => {
    expect(formatRatio(ratio)).toBe(text);
  });
});

describe('amountChangeView', () => {
  const eur = (mkd: number, ratio: number | null) => ({ amount: mkd, ratio });

  it('shows amount and percentage with a sign, in denars', () => {
    expect(amountChangeView('income', eur(30_000, 0.3), 'MKD', '2026-11').text).toBe(
      '+30,000 MKD (+30%)',
    );
    expect(amountChangeView('income', eur(-10_000, -0.2), 'MKD', '2026-11').text).toBe(
      '−10,000 MKD (−20%)',
    );
  });

  it('shows euros at the rate of the month', () => {
    expect(amountChangeView('income', eur(30_000, 0.3), 'EUR', '2026-11').text).toBe(
      '+€487.80 (+30%)',
    );
    expect(amountChangeView('expenses', eur(-10_000, -0.2), 'EUR', '2026-11').text).toBe(
      '−€162.60 (−20%)',
    );
  });

  it('leaves out the percentage when there is nothing to compare with', () => {
    expect(amountChangeView('income', eur(100_000, null), 'MKD', '2026-11').text).toBe(
      '+100,000 MKD',
    );
  });

  it('says "No change" for an equal amount', () => {
    expect(amountChangeView('net', eur(0, 0), 'EUR', '2026-11')).toEqual({
      text: 'No change',
      tone: 'neutral',
      direction: 'none',
    });
  });

  it('is good when income and net go up, bad when they go down', () => {
    for (const kpi of ['income', 'net'] as const) {
      expect(amountChangeView(kpi, eur(5, 0.1), 'MKD', '2026-11')).toMatchObject({
        tone: 'good',
        direction: 'up',
      });
      expect(amountChangeView(kpi, eur(-5, -0.1), 'MKD', '2026-11')).toMatchObject({
        tone: 'bad',
        direction: 'down',
      });
    }
  });

  it('is bad when expenses go up, good when they go down', () => {
    expect(amountChangeView('expenses', eur(5, 0.1), 'MKD', '2026-11')).toMatchObject({
      tone: 'bad',
      direction: 'up',
    });
    expect(amountChangeView('expenses', eur(-5, -0.1), 'MKD', '2026-11')).toMatchObject({
      tone: 'good',
      direction: 'down',
    });
  });
});

describe('rateChangeView', () => {
  it('shows percentage points with a sign, up being good', () => {
    expect(rateChangeView(0.192307)).toEqual({ text: '+19.2 pts', tone: 'good', direction: 'up' });
    expect(rateChangeView(-0.1)).toEqual({ text: '−10.0 pts', tone: 'bad', direction: 'down' });
  });

  it('shows "—" when there is no rate to compare', () => {
    expect(rateChangeView(null)).toEqual({ text: '—', tone: 'neutral', direction: 'none' });
  });

  it('says "No change" when it rounds to nothing', () => {
    expect(rateChangeView(0)).toMatchObject({ text: 'No change', direction: 'none' });
    expect(rateChangeView(0.0004)).toMatchObject({ text: 'No change', tone: 'neutral' });
    expect(rateChangeView(-0.0004)).toMatchObject({ text: 'No change' });
  });
});
