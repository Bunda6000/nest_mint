import { HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryExchangeRates } from '../testing/exchange-rates-fake.js';
import { ExchangeRatesService, parseRateDay } from './exchange-rates.service.js';

let service: ExchangeRatesService;
beforeEach(() => {
  service = new ExchangeRatesService(new InMemoryExchangeRates());
});

describe('exchange rates', () => {
  it('starts with the spreadsheet rate and no entries', async () => {
    expect(await service.list('a')).toEqual({ defaultMkdPerEur: 61.5, rates: [] });
  });

  it('keeps rates oldest first and replaces a rate saved for the same day', async () => {
    await service.save('a', '2026-06-01', { mkdPerEur: 61.7 });
    await service.save('a', '2026-01-01', { mkdPerEur: 61.5 });
    await service.save('a', '2026-06-01', { mkdPerEur: 61.6 });
    expect((await service.list('a')).rates).toEqual([
      { effectiveFrom: '2026-01-01', mkdPerEur: 61.5 },
      { effectiveFrom: '2026-06-01', mkdPerEur: 61.6 },
    ]);
  });

  it("keeps users apart and 404s on a rate that isn't there", async () => {
    await service.save('a', '2026-01-01', { mkdPerEur: 62 });
    expect((await service.list('b')).rates).toEqual([]);
    await expect(service.delete('b', '2026-01-01')).rejects.toBeInstanceOf(HttpException);
    await service.delete('a', '2026-01-01');
    expect((await service.list('a')).rates).toEqual([]);
  });

  it('refuses a day that is not a date', () => {
    expect(() => parseRateDay('2026-13-45')).toThrow(HttpException);
    expect(() => parseRateDay('yesterday')).toThrow(HttpException);
    expect(parseRateDay('2026-11-08')).toBe('2026-11-08');
  });
});
