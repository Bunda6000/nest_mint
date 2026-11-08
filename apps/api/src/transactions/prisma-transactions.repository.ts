import { Injectable } from '@nestjs/common';
import type { TransactionResponse } from '@nestmint/shared';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type { NewTransaction, TransactionsRepository } from './transactions.repository.js';

const select = {
  id: true,
  categoryId: true,
  amountMkd: true,
  occurredOn: true,
  note: true,
  category: { select: { name: true } },
} as const;

interface Row {
  id: string;
  categoryId: string;
  amountMkd: number;
  occurredOn: Date;
  note: string | null;
  category: { name: string };
}

const toResponse = (row: Row): TransactionResponse => ({
  id: row.id,
  categoryId: row.categoryId,
  categoryName: row.category.name,
  amountMkd: row.amountMkd,
  // A DATE column comes back as midnight UTC, so the first 10 characters are the calendar day.
  occurredOn: row.occurredOn.toISOString().slice(0, 10),
  note: row.note,
});

@Injectable()
export class PrismaTransactionsRepository implements TransactionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, input: NewTransaction): Promise<TransactionResponse> {
    const row = await this.prisma.transaction.create({
      data: {
        id: randomUUID(),
        userId,
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
      orderBy: [{ occurredOn: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select,
    });
    return rows.map(toResponse);
  }
}
