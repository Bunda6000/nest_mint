import { Injectable } from '@nestjs/common';
import type { IncomeRecurrence, IncomeResponse } from '@nestmint/shared';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type { IncomeChange, IncomeRepository, NewIncome } from './income.repository.js';

interface Row {
  id: string;
  name: string;
  amountMkd: number;
  recurrence: IncomeRecurrence;
  receivedOn: Date | null;
  startMonth: Date | null;
  endMonth: Date | null;
  payDay: number | null;
}

// A DATE column comes back as midnight UTC, so the first 10 characters are the calendar day
// and the first 7 are the month.
const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);
const month = (date: Date | null) => (date ? date.toISOString().slice(0, 7) : null);

const toResponse = (row: Row): IncomeResponse => ({
  id: row.id,
  name: row.name,
  amountMkd: row.amountMkd,
  recurrence: row.recurrence,
  receivedOn: day(row.receivedOn),
  startMonth: month(row.startMonth),
  endMonth: month(row.endMonth),
  payDay: row.payDay,
});

const toDay = (value: string) => new Date(`${value}T00:00:00.000Z`);
/** "2026-11" → 1 November 2026, midnight UTC. */
const toMonthStart = (value: string) => new Date(`${value}-01T00:00:00.000Z`);

@Injectable()
export class PrismaIncomeRepository implements IncomeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, input: NewIncome): Promise<IncomeResponse> {
    const row = await this.prisma.income.create({
      data: {
        id: randomUUID(),
        userId,
        name: input.name,
        amountMkd: input.amountMkd,
        recurrence: input.recurrence,
        receivedOn: input.receivedOn ? toDay(input.receivedOn) : null,
        startMonth: input.startMonth ? toMonthStart(input.startMonth) : null,
        endMonth: input.endMonth ? toMonthStart(input.endMonth) : null,
        payDay: input.payDay,
      },
    });
    return toResponse(row);
  }

  async list(userId: string): Promise<IncomeResponse[]> {
    const rows = await this.prisma.income.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toResponse);
  }

  async find(userId: string, id: string): Promise<IncomeResponse | null> {
    const row = await this.prisma.income.findFirst({ where: { id, userId } });
    return row ? toResponse(row) : null;
  }

  async update(userId: string, id: string, change: IncomeChange): Promise<IncomeResponse | null> {
    const { count } = await this.prisma.income.updateMany({
      where: { id, userId },
      data: {
        ...(change.name !== undefined ? { name: change.name } : {}),
        ...(change.amountMkd !== undefined ? { amountMkd: change.amountMkd } : {}),
        ...(change.receivedOn !== undefined ? { receivedOn: toDay(change.receivedOn) } : {}),
        ...(change.startMonth !== undefined ? { startMonth: toMonthStart(change.startMonth) } : {}),
        ...(change.endMonth !== undefined
          ? { endMonth: change.endMonth === null ? null : toMonthStart(change.endMonth) }
          : {}),
        ...(change.payDay !== undefined ? { payDay: change.payDay } : {}),
      },
    });
    return count === 0 ? null : this.find(userId, id);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.income.deleteMany({ where: { id, userId } });
    return count > 0;
  }
}
