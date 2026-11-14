import { Injectable } from '@nestjs/common';
import type { ExchangeRateResponse } from '@nestmint/shared';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ExchangeRatesRepository } from './exchange-rates.repository.js';

const SCALE = 10_000;
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

@Injectable()
export class PrismaExchangeRatesRepository implements ExchangeRatesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<ExchangeRateResponse[]> {
    const rows = await this.prisma.exchangeRate.findMany({
      where: { userId },
      orderBy: { effectiveFrom: 'asc' },
      select: { effectiveFrom: true, rateX10000: true },
    });
    return rows.map((r) => ({
      effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10),
      mkdPerEur: r.rateX10000 / SCALE,
    }));
  }

  async save(userId: string, rate: ExchangeRateResponse): Promise<void> {
    const effectiveFrom = day(rate.effectiveFrom);
    const rateX10000 = Math.round(rate.mkdPerEur * SCALE);
    await this.prisma.exchangeRate.upsert({
      where: { userId_effectiveFrom: { userId, effectiveFrom } },
      create: { id: randomUUID(), userId, effectiveFrom, rateX10000 },
      update: { rateX10000 },
    });
  }

  async delete(userId: string, effectiveFrom: string): Promise<boolean> {
    const result = await this.prisma.exchangeRate.deleteMany({
      where: { userId, effectiveFrom: day(effectiveFrom) },
    });
    return result.count > 0;
  }
}
