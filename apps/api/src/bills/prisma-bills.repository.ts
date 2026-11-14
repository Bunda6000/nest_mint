import { Injectable } from '@nestjs/common';
import type { GroupMonthTotal } from '@nestmint/shared';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  type BillChange,
  BillPaymentError,
  type BillRecord,
  type BillsRepository,
  type NewBill,
  type Payment,
  paymentNote,
} from './bills.repository.js';

/** "2026-11" → 1 November 2026, midnight UTC. */
const toMonthStart = (value: string) => new Date(`${value}-01T00:00:00.000Z`);
const toDay = (value: string) => new Date(`${value}T00:00:00.000Z`);
const day = (value: Date) => value.toISOString().slice(0, 10);

const select = {
  id: true,
  obligationId: true,
  periodMonth: true,
  dueDate: true,
  expectedAmountMkd: true,
  actualAmountMkd: true,
  invoiceRef: true,
  obligation: {
    select: {
      name: true,
      payee: true,
      categoryId: true,
      category: { select: { name: true } },
    },
  },
  transaction: { select: { id: true, occurredOn: true, amountMkd: true } },
} as const;

interface Row {
  id: string;
  obligationId: string;
  periodMonth: Date;
  dueDate: Date;
  expectedAmountMkd: number;
  actualAmountMkd: number | null;
  invoiceRef: string | null;
  obligation: {
    name: string;
    payee: string | null;
    categoryId: string;
    category: { name: string };
  };
  transaction: { id: string; occurredOn: Date; amountMkd: number } | null;
}

const toRecord = (row: Row): BillRecord => ({
  id: row.id,
  obligationId: row.obligationId,
  obligationName: row.obligation.name,
  payee: row.obligation.payee,
  categoryId: row.obligation.categoryId,
  categoryName: row.obligation.category.name,
  period: row.periodMonth.toISOString().slice(0, 7),
  dueDate: day(row.dueDate),
  expectedAmountMkd: row.expectedAmountMkd,
  actualAmountMkd: row.actualAmountMkd,
  invoiceRef: row.invoiceRef,
  paid: row.transaction
    ? {
        transactionId: row.transaction.id,
        paidOn: day(row.transaction.occurredOn),
        amountMkd: row.transaction.amountMkd,
      }
    : null,
});

const soonestDue = [{ dueDate: 'asc' }, { obligation: { name: 'asc' } }, { id: 'asc' }] as const;

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

  async listMonth(userId: string, month: string): Promise<BillRecord[]> {
    const rows = await this.prisma.bill.findMany({
      where: { userId, periodMonth: toMonthStart(month) },
      orderBy: [...soonestDue],
      select,
    });
    return rows.map(toRecord);
  }

  async listForObligation(userId: string, obligationId: string): Promise<BillRecord[]> {
    const rows = await this.prisma.bill.findMany({
      where: { userId, obligationId },
      orderBy: { periodMonth: 'asc' },
      select,
    });
    return rows.map(toRecord);
  }

  async sumExpectedByGroupAndMonth(
    userId: string,
    fromMonth: string,
    toMonth: string,
  ): Promise<GroupMonthTotal[]> {
    const rows = await this.prisma.bill.findMany({
      where: { userId, periodMonth: { gte: toMonthStart(fromMonth), lte: toMonthStart(toMonth) } },
      select: {
        periodMonth: true,
        expectedAmountMkd: true,
        obligation: {
          select: { category: { select: { group: { select: { id: true, name: true } } } } },
        },
      },
    });
    const totals = new Map<string, GroupMonthTotal>();
    for (const row of rows) {
      const group = row.obligation.category.group;
      const month = row.periodMonth.toISOString().slice(0, 7);
      const key = `${group.id}|${month}`;
      const known = totals.get(key);
      totals.set(key, {
        month,
        groupId: group.id,
        groupName: group.name,
        amountMkd: (known?.amountMkd ?? 0) + row.expectedAmountMkd,
      });
    }
    return [...totals.values()];
  }

  async listUnpaid(userId: string): Promise<BillRecord[]> {
    const rows = await this.prisma.bill.findMany({
      where: { userId, transactionId: null },
      orderBy: [...soonestDue],
      select,
    });
    return rows.map(toRecord);
  }

  async listPaid(userId: string, limit: number): Promise<BillRecord[]> {
    const rows = await this.prisma.bill.findMany({
      where: { userId, transactionId: { not: null } },
      orderBy: [{ transaction: { occurredOn: 'desc' } }, { dueDate: 'desc' }, { id: 'asc' }],
      take: limit,
      select,
    });
    return rows.map(toRecord);
  }

  countPaid(userId: string): Promise<number> {
    return this.prisma.bill.count({ where: { userId, transactionId: { not: null } } });
  }

  async find(userId: string, id: string): Promise<BillRecord | null> {
    const row = await this.prisma.bill.findFirst({ where: { id, userId }, select });
    return row ? toRecord(row) : null;
  }

  async deleteUnpaidFromMonth(
    userId: string,
    obligationId: string,
    fromMonth: string,
  ): Promise<number> {
    const { count } = await this.prisma.bill.deleteMany({
      where: {
        userId,
        obligationId,
        transactionId: null,
        periodMonth: { gte: toMonthStart(fromMonth) },
      },
    });
    return count;
  }

  async countPaidForObligation(userId: string, obligationId: string): Promise<number> {
    return this.prisma.bill.count({
      where: { userId, obligationId, transactionId: { not: null } },
    });
  }

  async deleteUnpaidForObligation(userId: string, obligationId: string): Promise<number> {
    const { count } = await this.prisma.bill.deleteMany({
      where: { userId, obligationId, transactionId: null },
    });
    return count;
  }

  async setUnpaidExpectedAmounts(
    userId: string,
    obligationId: string,
    fromMonth: string,
    amountForPeriod: (period: string) => number,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const bills = await tx.bill.findMany({
        where: {
          userId,
          obligationId,
          transactionId: null,
          periodMonth: { gte: toMonthStart(fromMonth) },
        },
        select: { id: true, periodMonth: true },
      });
      let changed = 0;
      for (const bill of bills) {
        // "transactionId: null" again: a bill paid a moment ago is left alone.
        const { count } = await tx.bill.updateMany({
          where: { id: bill.id, userId, transactionId: null },
          data: { expectedAmountMkd: amountForPeriod(bill.periodMonth.toISOString().slice(0, 7)) },
        });
        changed += count;
      }
      return changed;
    });
  }

  async update(userId: string, id: string, change: BillChange): Promise<BillRecord | null> {
    // "transactionId: null" in the condition: a bill that was paid a moment ago is left alone.
    const { count } = await this.prisma.bill.updateMany({
      where: { id, userId, transactionId: null },
      data: {
        ...(change.actualAmountMkd !== undefined && { actualAmountMkd: change.actualAmountMkd }),
        ...(change.invoiceRef !== undefined && { invoiceRef: change.invoiceRef }),
      },
    });
    return count === 0 ? null : this.find(userId, id);
  }

  async pay(userId: string, payments: Payment[]): Promise<BillRecord[]> {
    return this.prisma.$transaction(async (tx) => {
      for (const payment of payments) {
        const bill = await tx.bill.findFirst({
          where: { id: payment.billId, userId },
          select: {
            id: true,
            invoiceRef: true,
            obligation: { select: { name: true, categoryId: true } },
          },
        });
        if (!bill) throw new BillPaymentError('not_found', payment.billId);

        const expense = await tx.transaction.create({
          data: {
            id: randomUUID(),
            userId,
            kind: 'expense',
            categoryId: bill.obligation.categoryId,
            amountMkd: payment.amountMkd,
            occurredOn: toDay(payment.paidOn),
            note: paymentNote(bill.obligation.name, bill.invoiceRef),
          },
          select: { id: true },
        });

        // Only a bill with no payment yet can be linked. Two requests at once: the second waits for
        // the first, then finds the bill taken, throws, and its expense is rolled back with it.
        const { count } = await tx.bill.updateMany({
          where: { id: bill.id, userId, transactionId: null },
          data: { transactionId: expense.id },
        });
        if (count === 0) throw new BillPaymentError('already_paid', payment.billId);
      }

      const rows = await tx.bill.findMany({
        where: { userId, id: { in: payments.map((p) => p.billId) } },
        select,
      });
      const byId = new Map(rows.map((row) => [row.id, toRecord(row)]));
      return payments.map((p) => byId.get(p.billId)!);
    });
  }

  async undoPayment(userId: string, billId: string): Promise<BillRecord> {
    return this.prisma.$transaction(async (tx) => {
      const bill = await tx.bill.findFirst({
        where: { id: billId, userId },
        select: { transactionId: true },
      });
      if (!bill) throw new BillPaymentError('not_found', billId);
      if (!bill.transactionId) throw new BillPaymentError('not_paid', billId);

      // The bill lets go of the expense first (the database will not delete an expense a bill uses).
      const { count } = await tx.bill.updateMany({
        where: { id: billId, userId, transactionId: bill.transactionId },
        data: { transactionId: null },
      });
      if (count === 0) throw new BillPaymentError('not_paid', billId);
      await tx.transaction.deleteMany({ where: { id: bill.transactionId, userId } });

      const row = await tx.bill.findFirstOrThrow({ where: { id: billId, userId }, select });
      return toRecord(row);
    });
  }
}
