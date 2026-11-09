import { Injectable } from '@nestjs/common';
import type { CategoryTotalResponse, TransactionKind, TransactionResponse } from '@nestmint/shared';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  NewTransaction,
  TransactionChange,
  TransactionsRepository,
} from './transactions.repository.js';

const select = {
  id: true,
  kind: true,
  categoryId: true,
  amountMkd: true,
  occurredOn: true,
  note: true,
  category: { select: { name: true } },
} as const;

interface Row {
  id: string;
  kind: TransactionKind;
  categoryId: string;
  amountMkd: number;
  occurredOn: Date;
  note: string | null;
  category: { name: string };
}

const toResponse = (row: Row): TransactionResponse => ({
  id: row.id,
  kind: row.kind,
  categoryId: row.categoryId,
  categoryName: row.category.name,
  amountMkd: row.amountMkd,
  // A DATE column comes back as midnight UTC, so the first 10 characters are the calendar day.
  occurredOn: row.occurredOn.toISOString().slice(0, 10),
  note: row.note,
});

const newestFirst = [{ occurredOn: 'desc' }, { createdAt: 'desc' }] as const;

/** First day of the month and of the next one, as midnight UTC. `month` is "YYYY-MM". */
function monthRange(month: string): { from: Date; to: Date } {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1;
  return { from: new Date(Date.UTC(year, index, 1)), to: new Date(Date.UTC(year, index + 1, 1)) };
}

@Injectable()
export class PrismaTransactionsRepository implements TransactionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, input: NewTransaction): Promise<TransactionResponse> {
    const row = await this.prisma.transaction.create({
      data: {
        id: randomUUID(),
        userId,
        kind: input.kind,
        categoryId: input.categoryId,
        amountMkd: input.amountMkd,
        occurredOn: new Date(`${input.occurredOn}T00:00:00.000Z`),
        note: input.note,
      },
      select,
    });
    return toResponse(row);
  }

  async listRecent(userId: string, limit: number): Promise<TransactionResponse[]> {
    const rows = await this.prisma.transaction.findMany({
      where: { userId },
      orderBy: [...newestFirst],
      take: limit,
      select,
    });
    return rows.map(toResponse);
  }

  async listMonth(
    userId: string,
    month: string,
    categoryId?: string,
  ): Promise<TransactionResponse[]> {
    const { from, to } = monthRange(month);
    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        occurredOn: { gte: from, lt: to },
        ...(categoryId ? { categoryId } : {}),
      },
      orderBy: [...newestFirst],
      select,
    });
    return rows.map(toResponse);
  }

  async sumMonth(userId: string, month: string): Promise<number> {
    const { from, to } = monthRange(month);
    const result = await this.prisma.transaction.aggregate({
      _sum: { amountMkd: true },
      where: { userId, occurredOn: { gte: from, lt: to } },
    });
    return result._sum.amountMkd ?? 0;
  }

  async sumByCategory(userId: string, month: string): Promise<CategoryTotalResponse[]> {
    const { from, to } = monthRange(month);
    const totals = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      _sum: { amountMkd: true },
      where: { userId, occurredOn: { gte: from, lt: to } },
    });
    if (totals.length === 0) return [];
    const categories = await this.prisma.category.findMany({
      where: { userId, id: { in: totals.map((t) => t.categoryId) } },
      select: { id: true, name: true, group: { select: { id: true, name: true } } },
    });
    const byId = new Map(categories.map((c) => [c.id, c]));
    return totals
      .flatMap((total) => {
        const category = byId.get(total.categoryId);
        const amountMkd = total._sum.amountMkd ?? 0;
        if (!category || amountMkd <= 0) return [];
        return [
          {
            categoryId: category.id,
            categoryName: category.name,
            groupId: category.group.id,
            groupName: category.group.name,
            amountMkd,
          },
        ];
      })
      .sort((a, b) => b.amountMkd - a.amountMkd || a.categoryName.localeCompare(b.categoryName));
  }

  async listBiggest(userId: string, month: string, limit: number): Promise<TransactionResponse[]> {
    const { from, to } = monthRange(month);
    const rows = await this.prisma.transaction.findMany({
      where: { userId, occurredOn: { gte: from, lt: to } },
      orderBy: [{ amountMkd: 'desc' }, ...newestFirst],
      take: limit,
      select,
    });
    return rows.map(toResponse);
  }

  async sumByMonth(
    userId: string,
    fromMonth: string,
    toMonth: string,
  ): Promise<Record<string, number>> {
    const days = await this.prisma.transaction.groupBy({
      by: ['occurredOn'],
      _sum: { amountMkd: true },
      where: {
        userId,
        occurredOn: { gte: monthRange(fromMonth).from, lt: monthRange(toMonth).to },
      },
    });
    const result: Record<string, number> = {};
    for (const day of days) {
      const month = day.occurredOn.toISOString().slice(0, 7);
      result[month] = (result[month] ?? 0) + (day._sum.amountMkd ?? 0);
    }
    return result;
  }

  async find(userId: string, id: string): Promise<TransactionResponse | null> {
    const row = await this.prisma.transaction.findFirst({ where: { id, userId }, select });
    return row ? toResponse(row) : null;
  }

  async update(
    userId: string,
    id: string,
    change: TransactionChange,
  ): Promise<TransactionResponse | null> {
    const { count } = await this.prisma.transaction.updateMany({
      where: { id, userId },
      data: {
        ...(change.categoryId !== undefined ? { categoryId: change.categoryId } : {}),
        ...(change.amountMkd !== undefined ? { amountMkd: change.amountMkd } : {}),
        ...(change.occurredOn !== undefined
          ? { occurredOn: new Date(`${change.occurredOn}T00:00:00.000Z`) }
          : {}),
        ...(change.note !== undefined ? { note: change.note } : {}),
      },
    });
    return count === 0 ? null : this.find(userId, id);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.transaction.deleteMany({ where: { id, userId } });
    return count > 0;
  }
}
