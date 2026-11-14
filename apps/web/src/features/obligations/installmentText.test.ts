import type { InstallmentDetails } from '@nestmint/shared';
import { describe, expect, it } from 'vitest';
import {
  describeInstallmentPlan,
  describeInstallmentProgress,
  previewInstallmentPlan,
} from './installmentText';

const kirby: InstallmentDetails = {
  contractTotalMkd: 153_750,
  firstInstallmentMkd: 5_500,
  installmentCount: 50,
  paidCount: 28,
  paidMkd: 88_525,
  remainingMkd: 65_225,
  installmentsLeft: 22,
};

describe('describeInstallmentPlan', () => {
  it('names the total, the count and the first installment', () => {
    expect(describeInstallmentPlan(kirby)).toBe(
      'Contract 153,750 MKD · 50 installments, first 5,500 MKD',
    );
  });
});

describe('describeInstallmentProgress', () => {
  it('shows paid, what is left and installments left (the Кирби sheet)', () => {
    expect(describeInstallmentProgress(kirby)).toBe(
      'Paid 28 of 50 · 65,225 MKD left · 22 installments left',
    );
  });

  it('says "1 installment" and "Fully paid"', () => {
    expect(describeInstallmentProgress({ ...kirby, installmentsLeft: 1 })).toContain(
      '· 1 installment left',
    );
    expect(
      describeInstallmentProgress({
        ...kirby,
        paidCount: 50,
        remainingMkd: 0,
        installmentsLeft: 0,
      }),
    ).toBe('Fully paid');
  });
});

describe('previewInstallmentPlan', () => {
  it('shows the count, the smaller last installment and the last month', () => {
    expect(previewInstallmentPlan(153_750, 5_500, 3_075, '2023-10')).toBe(
      '50 installments, the last one 650 MKD, until November 2027',
    );
  });

  it('leaves the last installment out when it equals the regular one', () => {
    expect(previewInstallmentPlan(10_000, 1_000, 3_000, '2026-01')).toBe(
      '4 installments, until April 2026',
    );
  });

  it('is empty while the numbers or month do not make a plan', () => {
    expect(previewInstallmentPlan(1_000, 2_000, 100, '2026-01')).toBeNull();
    expect(previewInstallmentPlan(1_000, 100, 100, '')).toBeNull();
  });

  it('warns about too many installments', () => {
    expect(previewInstallmentPlan(1_000_000, 1, 1, '2026-01')).toBe(
      'Too many installments (at most 600)',
    );
  });
});
