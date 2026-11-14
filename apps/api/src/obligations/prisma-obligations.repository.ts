import { Injectable } from '@nestjs/common';
import type {
  ExtraPaymentKind,
  LoanType,
  ObligationKind,
  ObligationRecurrence,
  ObligationResponse,
  RateChangeResponse,
} from '@nestmint/shared';
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
  kind: true,
  loanType: true,
  principalMkd: true,
  annualRateBp: true,
  createdAt: true,
  category: { select: { name: true } },
  rateChanges: {
    select: { effectiveMonth: true, annualRateBp: true, monthlyPaymentMkd: true },
    orderBy: { effectiveMonth: 'asc' },
  },
  extraPayments: {
    select: { id: true, paidOn: true, amountMkd: true, kind: true },
    orderBy: { paidOn: 'asc' },
  },
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
  kind: ObligationKind;
  loanType: LoanType | null;
  principalMkd: number | null;
  annualRateBp: number | null;
  createdAt: Date;
  category: { name: string };
  rateChanges: { effectiveMonth: Date; annualRateBp: number; monthlyPaymentMkd: number }[];
  extraPayments: { id: string; paidOn: Date; amountMkd: number; kind: ExtraPaymentKind }[];
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
  createdMonth: month(row.createdAt)!,
  kind: row.kind,
  loan:
    row.kind === 'loan' &&
    row.loanType !== null &&
    row.principalMkd !== null &&
    row.annualRateBp !== null
      ? {
          loanType: row.loanType,
          principalMkd: row.principalMkd,
          annualRateBp: row.annualRateBp,
          rateChanges: row.rateChanges.map((c) => ({
            effectiveMonth: month(c.effectiveMonth)!,
            annualRateBp: c.annualRateBp,
            monthlyPaymentMkd: c.monthlyPaymentMkd,
          })),
          extraPayments: row.extraPayments.map((e) => ({
            id: e.id,
            paidOn: e.paidOn.toISOString().slice(0, 10),
            amountMkd: e.amountMkd,
            kind: e.kind,
          })),
        }
      : null,
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
        ...(input.loan
          ? {
              kind: 'loan' as const,
              loanType: input.loan.loanType,
              principalMkd: input.loan.principalMkd,
              annualRateBp: input.loan.annualRateBp,
            }
          : {}),
      },
      select,
    });
    return toResponse(row);
  }

  async list(userId: string): Promise<ObligationResponse[]> {
    const rows = await this.prisma.obligation.findMany({
      where: { userId, archivedAt: null },
      orderBy: { createdAt: 'desc' },
      select,
    });
    return rows.map(toResponse);
  }

  async find(userId: string, id: string): Promise<ObligationResponse | null> {
    const row = await this.prisma.obligation.findFirst({
      where: { id, userId, archivedAt: null },
      select,
    });
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
        ...(change.loanType !== undefined ? { loanType: change.loanType } : {}),
        ...(change.principalMkd !== undefined ? { principalMkd: change.principalMkd } : {}),
      },
    });
    return count === 0 ? null : this.find(userId, id);
  }

  async upsertRateChange(
    userId: string,
    id: string,
    change: RateChangeResponse,
  ): Promise<ObligationResponse | null> {
    const owned = await this.prisma.obligation.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!owned) return null;
    const effectiveMonth = toMonthStart(change.effectiveMonth);
    await this.prisma.loanRateChange.upsert({
      where: { obligationId_effectiveMonth: { obligationId: id, effectiveMonth } },
      create: {
        id: randomUUID(),
        userId,
        obligationId: id,
        effectiveMonth,
        annualRateBp: change.annualRateBp,
        monthlyPaymentMkd: change.monthlyPaymentMkd,
      },
      update: {
        annualRateBp: change.annualRateBp,
        monthlyPaymentMkd: change.monthlyPaymentMkd,
      },
    });
    return this.find(userId, id);
  }

  async addExtraPayment(
    userId: string,
    id: string,
    payment: { paidOn: string; amountMkd: number; kind: ExtraPaymentKind },
  ): Promise<ObligationResponse | null> {
    const owned = await this.prisma.obligation.findFirst({
      where: { id, userId, archivedAt: null },
      select: { id: true },
    });
    if (!owned) return null;
    await this.prisma.loanExtraPayment.create({
      data: {
        id: randomUUID(),
        userId,
        obligationId: id,
        paidOn: new Date(`${payment.paidOn}T00:00:00.000Z`),
        amountMkd: payment.amountMkd,
        kind: payment.kind,
      },
    });
    return this.find(userId, id);
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.obligation.deleteMany({ where: { id, userId } });
    return count > 0;
  }

  async archive(userId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.obligation.updateMany({
      where: { id, userId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    return count > 0;
  }
}
