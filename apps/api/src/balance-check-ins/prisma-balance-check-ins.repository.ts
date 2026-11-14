import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type { BalanceCheckInsRepository, StoredCheckIn } from './balance-check-ins.repository.js';

const toMonthStart = (value: string) => new Date(`${value}-01T00:00:00.000Z`);

const toStored = (row: {
  month: Date;
  closingBalanceMkd: number;
  openingBalanceMkd: number | null;
}): StoredCheckIn => ({
  month: row.month.toISOString().slice(0, 7),
  closingMkd: row.closingBalanceMkd,
  openingMkd: row.openingBalanceMkd,
});

const select = { month: true, closingBalanceMkd: true, openingBalanceMkd: true } as const;

@Injectable()
export class PrismaBalanceCheckInsRepository implements BalanceCheckInsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find(userId: string, month: string): Promise<StoredCheckIn | null> {
    const row = await this.prisma.balanceCheckIn.findFirst({
      where: { userId, month: toMonthStart(month) },
      select,
    });
    return row ? toStored(row) : null;
  }

  async findBefore(userId: string, month: string): Promise<StoredCheckIn | null> {
    const row = await this.prisma.balanceCheckIn.findFirst({
      where: { userId, month: { lt: toMonthStart(month) } },
      orderBy: { month: 'desc' },
      select,
    });
    return row ? toStored(row) : null;
  }

  async save(userId: string, checkIn: StoredCheckIn): Promise<void> {
    const month = toMonthStart(checkIn.month);
    await this.prisma.balanceCheckIn.upsert({
      where: { userId_month: { userId, month } },
      create: {
        id: randomUUID(),
        userId,
        month,
        closingBalanceMkd: checkIn.closingMkd,
        openingBalanceMkd: checkIn.openingMkd,
      },
      update: {
        closingBalanceMkd: checkIn.closingMkd,
        openingBalanceMkd: checkIn.openingMkd,
      },
    });
  }
}
