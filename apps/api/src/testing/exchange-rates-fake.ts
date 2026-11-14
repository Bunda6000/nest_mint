import type { ExchangeRateResponse } from '@nestmint/shared';
import type { ExchangeRatesRepository } from '../exchange-rates/exchange-rates.repository.js';

export class InMemoryExchangeRates implements ExchangeRatesRepository {
  readonly rows: (ExchangeRateResponse & { userId: string })[] = [];

  async list(userId: string): Promise<ExchangeRateResponse[]> {
    return this.rows
      .filter((r) => r.userId === userId)
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
      .map(({ effectiveFrom, mkdPerEur }) => ({ effectiveFrom, mkdPerEur }));
  }

  async save(userId: string, rate: ExchangeRateResponse): Promise<void> {
    await this.delete(userId, rate.effectiveFrom);
    this.rows.push({ userId, ...rate });
  }

  async delete(userId: string, effectiveFrom: string): Promise<boolean> {
    const index = this.rows.findIndex(
      (r) => r.userId === userId && r.effectiveFrom === effectiveFrom,
    );
    if (index < 0) return false;
    this.rows.splice(index, 1);
    return true;
  }
}
