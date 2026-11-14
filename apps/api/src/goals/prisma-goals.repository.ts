import { Injectable } from '@nestjs/common';
import type { GoalKind } from '@nestmint/shared';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  GoalChange,
  GoalsRepository,
  NewContribution,
  NewGoal,
  StoredContribution,
  StoredGoal,
} from './goals.repository.js';

const monthStart = (month: string) => new Date(`${month}-01T00:00:00.000Z`);
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

interface GoalRow {
  id: string;
  name: string;
  kind: string;
  priority: number;
  archivedAt: Date | null;
  targetMkd: number | null;
  targetMonth: Date | null;
  monthlyMkd: number | null;
}

const toGoal = (row: GoalRow): StoredGoal => ({
  id: row.id,
  name: row.name,
  kind: row.kind as GoalKind,
  priority: row.priority as 1 | 2 | 3,
  archived: row.archivedAt !== null,
  targetMkd: row.targetMkd,
  targetMonth: row.targetMonth ? row.targetMonth.toISOString().slice(0, 7) : null,
  monthlyMkd: row.monthlyMkd,
});

const toContribution = (row: {
  id: string;
  goalId: string;
  amountMkd: number;
  occurredOn: Date;
  note: string | null;
}): StoredContribution => ({
  id: row.id,
  goalId: row.goalId,
  amountMkd: row.amountMkd,
  occurredOn: row.occurredOn.toISOString().slice(0, 10),
  note: row.note,
});

@Injectable()
export class PrismaGoalsRepository implements GoalsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, includeArchived: boolean): Promise<StoredGoal[]> {
    const rows = await this.prisma.savingsGoal.findMany({
      where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toGoal);
  }

  async find(userId: string, goalId: string): Promise<StoredGoal | null> {
    const row = await this.prisma.savingsGoal.findFirst({ where: { id: goalId, userId } });
    return row ? toGoal(row) : null;
  }

  create(userId: string, goal: NewGoal, starting: NewContribution | null): Promise<StoredGoal> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.savingsGoal.create({
        data: {
          id: randomUUID(),
          userId,
          name: goal.name,
          kind: goal.kind,
          priority: goal.priority,
          targetMkd: goal.targetMkd,
          targetMonth: goal.targetMonth ? monthStart(goal.targetMonth) : null,
          monthlyMkd: goal.monthlyMkd,
        },
      });
      if (starting) {
        await tx.goalContribution.create({
          data: {
            id: randomUUID(),
            userId,
            goalId: row.id,
            amountMkd: starting.amountMkd,
            occurredOn: day(starting.occurredOn),
            note: starting.note,
          },
        });
      }
      return toGoal(row);
    });
  }

  async update(userId: string, goalId: string, change: GoalChange): Promise<StoredGoal | null> {
    const data = {
      ...(change.name !== undefined ? { name: change.name } : {}),
      ...(change.priority !== undefined ? { priority: change.priority } : {}),
      ...(change.targetMkd !== undefined ? { targetMkd: change.targetMkd } : {}),
      ...(change.targetMonth !== undefined ? { targetMonth: monthStart(change.targetMonth) } : {}),
      ...(change.monthlyMkd !== undefined ? { monthlyMkd: change.monthlyMkd } : {}),
      ...(change.archived !== undefined ? { archivedAt: change.archived ? new Date() : null } : {}),
    };
    const result = await this.prisma.savingsGoal.updateMany({
      where: { id: goalId, userId },
      data,
    });
    return result.count === 0 ? null : this.find(userId, goalId);
  }

  async delete(userId: string, goalId: string): Promise<boolean> {
    const result = await this.prisma.savingsGoal.deleteMany({ where: { id: goalId, userId } });
    return result.count > 0;
  }

  async contributions(userId: string, goalId?: string): Promise<StoredContribution[]> {
    const rows = await this.prisma.goalContribution.findMany({
      where: { userId, ...(goalId ? { goalId } : {}) },
      orderBy: [{ occurredOn: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toContribution);
  }

  async addContribution(
    userId: string,
    goalId: string,
    contribution: NewContribution,
  ): Promise<StoredContribution | null> {
    if (!(await this.find(userId, goalId))) return null;
    const row = await this.prisma.goalContribution.create({
      data: {
        id: randomUUID(),
        userId,
        goalId,
        amountMkd: contribution.amountMkd,
        occurredOn: day(contribution.occurredOn),
        note: contribution.note,
      },
    });
    return toContribution(row);
  }

  async deleteContribution(
    userId: string,
    goalId: string,
    contributionId: string,
  ): Promise<boolean> {
    const result = await this.prisma.goalContribution.deleteMany({
      where: { id: contributionId, goalId, userId },
    });
    return result.count > 0;
  }
}
