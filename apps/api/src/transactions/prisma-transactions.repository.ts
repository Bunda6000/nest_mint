import { Injectable } from '@nestjs/common';
import type { TransactionKind, TransactionResponse } from '@nestmint/shared';
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
