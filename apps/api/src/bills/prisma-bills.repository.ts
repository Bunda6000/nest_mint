import { Injectable } from '@nestjs/common';
import type { BillResponse } from '@nestmint/shared';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type { BillsRepository, NewBill } from './bills.repository.js';

/** "2026-11" → 1 November 2026, midnight UTC. */
const toMonthStart = (value: string) => new Date(`${value}-01T00:00:00.000Z`);
const toDay = (value: string) => new Date(`${value}T00:00:00.000Z`);

@Injectable()
export class PrismaBillsRepository implements BillsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createMissing(userId: string, bills: NewBill[]): Promise<number> {
    if (bills.length === 0) return 0;
    const { count } = await this.prisma.bill.createMany({
      data: bills.map((bill) => ({
        id: randomUUID(),
        userId,
        obligationId: bill.obligationId,
        periodMonth: toMonthStart(bill.period),
        dueDate: toDay(bill.dueDate),
        expectedAmountMkd: bill.expectedAmountMkd,
      })),
      skipDuplicates: true,
    });
    return count;
  }

  async listMonth(userId: string, month: string): Promise<BillResponse[]> {
    const rows = await this.prisma.bill.findMany({
      where: { userId, periodMonth: toMonthStart(month) },
      orderBy: [{ dueDate: 'asc' }, { obligation: { name: 'asc' } }, { id: 'asc' }],
      select: {
        id: true,
        obligationId: true,
        dueDate: true,
        expectedAmountMkd: true,
        obligation: {
          select: {
            name: true,
            payee: true,
            categoryId: true,
            category: { select: { name: true } },
          },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      obligationId: row.obligationId,
      obligationName: row.obligation.name,
      payee: row.obligation.payee,
      categoryId: row.obligation.categoryId,
      categoryName: row.obligation.category.name,
      period: month,
      dueDate: row.dueDate.toISOString().slice(0, 10),
      expectedAmountMkd: row.expectedAmountMkd,
    }));
  }
}
