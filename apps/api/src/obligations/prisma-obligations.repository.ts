import { Injectable } from '@nestjs/common';
import type { ObligationRecurrence, ObligationResponse } from '@nestmint/shared';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  NewObligation,
  ObligationChange,
  ObligationsRepository,
} from './obligations.repository.js';

const select = {
  id: true,
  name: true,
  payee: true,
  categoryId: true,
  expectedAmountMkd: true,
  dueDay: true,
  recurrence: true,
  everyNMonths: true,
  months: true,
  startMonth: true,
  endMonth: true,
  category: { select: { name: true } },
} as const;

interface Row {
  id: string;
  name: string;
  payee: string | null;
  categoryId: string;
  expectedAmountMkd: number;
  dueDay: number;
  recurrence: ObligationRecurrence;
  everyNMonths: number | null;
  months: number[];
  startMonth: Date;
  endMonth: Date | null;
  category: { name: string };
}

// A DATE column comes back as midnight UTC, so the first 7 characters are the month.
const month = (date: Date | null) => (date ? date.toISOString().slice(0, 7) : null);
/** "2026-11" → 1 November 2026, midnight UTC. */
const toMonthStart = (value: string) => new Date(`${value}-01T00:00:00.000Z`);

const toResponse = (row: Row): ObligationResponse => ({
  id: row.id,
  name: row.name,
  payee: row.payee,
  categoryId: row.categoryId,
  categoryName: row.category.name,
  expectedAmountMkd: row.expectedAmountMkd,
  dueDay: row.dueDay,
  recurrence: row.recurrence,
  everyNMonths: row.everyNMonths,
  months: row.recurrence === 'custom_months' ? [...row.months].sort((a, b) => a - b) : null,
  startMonth: month(row.startMonth)!,
  endMonth: month(row.endMonth),
});

@Injectable()
export class PrismaObligationsRepository implements ObligationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, input: NewObligation): Promise<ObligationResponse> {
    const row = await this.prisma.obligation.create({
      data: {
        id: randomUUID(),
        userId,
        categoryId: input.categoryId,
        name: input.name,
        payee: input.payee,
        expectedAmountMkd: input.expectedAmountMkd,
        dueDay: input.dueDay,
        recurrence: input.recurrence,
        everyNMonths: input.everyNMonths,
        months: input.months,
        startMonth: toMonthStart(input.startMonth),
        endMonth: input.endMonth ? toMonthStart(input.endMonth) : null,
      },
      select,
    });
    return toResponse(row);
  }

  async list(userId: string): Promise<ObligationResponse[]> {
    const rows = await this.prisma.obligation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select,
    });
    return rows.map(toResponse);
  }

  async find(userId: string, id: string): Promise<ObligationResponse | null> {
    const row = await this.prisma.obligation.findFirst({ where: { id, userId }, select });
    return row ? toResponse(row) : null;
  }

  async update(
    userId: string,
    id: string,
    change: ObligationChange,
  ): Promise<ObligationResponse | null> {
    const { count } = await this.prisma.obligation.updateMany({
      where: { id, userId },
      data: {
        ...(change.name !== undefined ? { name: change.name } : {}),
        ...(change.payee !== undefined ? { payee: change.payee } : {}),
        ...(change.categoryId !== undefined ? { categoryId: change.categoryId } : {}),
        ...(change.expectedAmountMkd !== undefined
          ? { expectedAmountMkd: change.expectedAmountMkd }
          : {}),
        ...(change.dueDay !== undefined ? { dueDay: change.dueDay } : {}),
        ...(change.startMonth !== undefined ? { startMonth: toMonthStart(change.startMonth) } : {}),
        ...(change.endMonth !== undefined
          ? { endMonth: change.endMonth === null ? null : toMonthStart(change.endMonth) }
          : {}),
        ...(change.everyNMonths !== undefined ? { everyNMonths: change.everyNMonths } : {}),
        ...(change.months !== undefined ? { months: change.months } : {}),
      },
    });
    return count === 0 ? null : this.find(userId, id);
  }
}
