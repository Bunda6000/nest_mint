import { Injectable } from '@nestjs/common';
import type {
  CategoriesResponse,
  CategoryResponse,
  CategoryUsageResponse,
  GroupResponse,
} from '@nestmint/shared';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  type CategoriesRepository,
  type CategoryRecord,
  DuplicateNameError,
  type ItemChange,
} from './categories.repository.js';
import type { SeedGroup } from './categories.seed.js';

/** Display order: the saved position, then the name so ties are stable. */
const display = [{ sortOrder: 'asc' }, { name: 'asc' }] as const;

const groupSelect = { id: true, name: true, archivedAt: true } as const;
const categorySelect = { id: true, groupId: true, name: true, archivedAt: true } as const;

interface GroupRow {
  id: string;
  name: string;
  archivedAt: Date | null;
}
interface CategoryRow extends GroupRow {
  groupId: string;
}

const toGroup = (row: GroupRow): GroupResponse => ({
  id: row.id,
  name: row.name,
  archived: row.archivedAt !== null,
});
const toCategory = (row: CategoryRow): CategoryResponse => ({
  id: row.id,
  groupId: row.groupId,
  name: row.name,
  archived: row.archivedAt !== null,
});

function isSameSet(actual: readonly string[], wanted: readonly string[]): boolean {
  return (
    actual.length === wanted.length &&
    new Set(wanted).size === wanted.length &&
    wanted.every((id) => actual.includes(id))
  );
}

/** Turns a unique-constraint violation into DuplicateNameError. */
async function withNameCheck<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new DuplicateNameError();
    }
    throw error;
  }
}

@Injectable()
export class PrismaCategoriesRepository implements CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async needsSeeding(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { categoriesSeededAt: true },
    });
    return user !== null && user.categoriesSeededAt === null;
  }

  async seedDefaultsOnce(userId: string, groups: readonly SeedGroup[], at: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Only one concurrent caller can flip the flag; the others wait for it, then find count 0.
      const claimed = await tx.user.updateMany({
        where: { id: userId, categoriesSeededAt: null },
        data: { categoriesSeededAt: at },
      });
      if (claimed.count === 0) return;

      const groupRows = groups.map((group, index) => ({
        id: randomUUID(),
        userId,
        name: group.name,
        sortOrder: index,
      }));
      await tx.categoryGroup.createMany({ data: groupRows });
      await tx.category.createMany({
        data: groups.flatMap((group, groupIndex) =>
          group.categories.map((name, index) => ({
            id: randomUUID(),
            userId,
            groupId: groupRows[groupIndex]!.id,
            name,
            sortOrder: index,
          })),
        ),
      });
    });
  }

  async list(userId: string, includeArchived: boolean): Promise<CategoriesResponse> {
    const visible = includeArchived ? {} : { archivedAt: null };
    const groups = await this.prisma.categoryGroup.findMany({
      where: { userId, ...visible },
      orderBy: [...display],
      select: {
        ...groupSelect,
        categories: {
          where: { userId, ...visible },
          orderBy: [...display],
          select: categorySelect,
        },
      },
    });
    return {
      groups: groups.map((group) => ({
        ...toGroup(group),
        categories: group.categories.map(toCategory),
      })),
    };
  }

  async findGroup(userId: string, groupId: string): Promise<GroupResponse | null> {
    const row = await this.prisma.categoryGroup.findFirst({
      where: { id: groupId, userId },
      select: groupSelect,
    });
    return row && toGroup(row);
  }

  async findGroupByName(userId: string, name: string): Promise<GroupResponse | null> {
    const row = await this.prisma.categoryGroup.findFirst({
      where: { userId, name: { equals: name, mode: 'insensitive' } },
      select: groupSelect,
    });
    return row && toGroup(row);
  }

  async findCategory(userId: string, categoryId: string): Promise<CategoryRecord | null> {
    const row = await this.prisma.category.findFirst({
      where: { id: categoryId, userId },
      select: { ...categorySelect, group: { select: { archivedAt: true } } },
    });
    return row && { ...toCategory(row), groupArchived: row.group.archivedAt !== null };
  }

  async findCategoryByName(
    userId: string,
    groupId: string,
    name: string,
  ): Promise<CategoryResponse | null> {
    const row = await this.prisma.category.findFirst({
      where: { userId, groupId, name: { equals: name, mode: 'insensitive' } },
      select: categorySelect,
    });
    return row && toCategory(row);
  }

  createGroup(userId: string, name: string): Promise<GroupResponse> {
    return withNameCheck(async () => {
      const last = await this.prisma.categoryGroup.aggregate({
        where: { userId },
        _max: { sortOrder: true },
      });
      const row = await this.prisma.categoryGroup.create({
        data: { id: randomUUID(), userId, name, sortOrder: (last._max.sortOrder ?? -1) + 1 },
        select: groupSelect,
      });
      return toGroup(row);
    });
  }

  createCategory(userId: string, groupId: string, name: string): Promise<CategoryResponse> {
    return withNameCheck(async () => {
      const last = await this.prisma.category.aggregate({
        where: { userId, groupId },
        _max: { sortOrder: true },
      });
      const row = await this.prisma.category.create({
        // The composite foreign key (group, owner) makes the database reject a foreign group.
        data: {
          id: randomUUID(),
          userId,
          groupId,
          name,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
        select: categorySelect,
      });
      return toCategory(row);
    });
  }

  updateGroup(
    userId: string,
    groupId: string,
    change: ItemChange,
    at: Date,
  ): Promise<GroupResponse | null> {
    return withNameCheck(() =>
      this.prisma.$transaction(async (tx) => {
        const current = await tx.categoryGroup.findFirst({
          where: { id: groupId, userId },
          select: groupSelect,
        });
        if (!current) return null;
        const data: { name?: string; archivedAt?: Date | null; sortOrder?: number } = {};
        if (change.name !== undefined) data.name = change.name;

        if (change.archived === true && current.archivedAt === null) {
          data.archivedAt = at;
          await tx.category.updateMany({
            where: { userId, groupId, archivedAt: null },
            data: { archivedAt: at },
          });
        } else if (change.archived === false && current.archivedAt !== null) {
          const last = await tx.categoryGroup.aggregate({
            where: { userId },
            _max: { sortOrder: true },
          });
          data.archivedAt = null;
          data.sortOrder = (last._max.sortOrder ?? -1) + 1;
        }

        await tx.categoryGroup.updateMany({ where: { id: groupId, userId }, data });
        const updated = await tx.categoryGroup.findFirstOrThrow({
          where: { id: groupId, userId },
          select: groupSelect,
        });
        return toGroup(updated);
      }),
    );
  }

  updateCategory(
    userId: string,
    categoryId: string,
    change: ItemChange,
    at: Date,
  ): Promise<CategoryResponse | null> {
    return withNameCheck(() =>
      this.prisma.$transaction(async (tx) => {
        const current = await tx.category.findFirst({
          where: { id: categoryId, userId },
          select: categorySelect,
        });
        if (!current) return null;

        const data: {
          name?: string;
          archivedAt?: Date | null;
          sortOrder?: number;
          groupId?: string;
        } = {};
        if (change.name !== undefined) data.name = change.name;
        if (change.groupId !== undefined && change.groupId !== current.groupId) {
          const last = await tx.category.aggregate({
            where: { userId, groupId: change.groupId },
            _max: { sortOrder: true },
          });
          data.groupId = change.groupId;
          data.sortOrder = (last._max.sortOrder ?? -1) + 1;
        }

        if (change.archived === true && current.archivedAt === null) {
          data.archivedAt = at;
        } else if (change.archived === false && current.archivedAt !== null) {
          const last = await tx.category.aggregate({
            where: { userId, groupId: current.groupId },
            _max: { sortOrder: true },
          });
          data.archivedAt = null;
          data.sortOrder = (last._max.sortOrder ?? -1) + 1;
        }

        await tx.category.updateMany({ where: { id: categoryId, userId }, data });
        const updated = await tx.category.findFirstOrThrow({
          where: { id: categoryId, userId },
          select: categorySelect,
        });
        return toCategory(updated);
      }),
    );
  }

  async categoryUsage(userId: string, categoryId: string): Promise<CategoryUsageResponse> {
    const [transactions, obligations] = await Promise.all([
      this.prisma.transaction.count({ where: { userId, categoryId } }),
      this.prisma.obligation.count({ where: { userId, categoryId } }),
    ]);
    return { transactions, obligations };
  }

  mergeCategory(
    userId: string,
    sourceId: string,
    targetId: string,
    at: Date,
  ): Promise<CategoryUsageResponse | null> {
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.category.count({
        where: { userId, id: { in: [sourceId, targetId] } },
      });
      if (found !== 2) return null;
      const moved = await tx.transaction.updateMany({
        where: { userId, categoryId: sourceId },
        data: { categoryId: targetId },
      });
      const obligations = await tx.obligation.updateMany({
        where: { userId, categoryId: sourceId },
        data: { categoryId: targetId },
      });
      await tx.category.updateMany({
        where: { userId, id: sourceId, archivedAt: null },
        data: { archivedAt: at },
      });
      return { transactions: moved.count, obligations: obligations.count };
    });
  }

  reorderGroups(userId: string, ids: readonly string[]): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const active = await tx.categoryGroup.findMany({
        where: { userId, archivedAt: null },
        select: { id: true },
      });
      if (
        !isSameSet(
          active.map((row) => row.id),
          ids,
        )
      )
        return false;
      for (const [index, id] of ids.entries()) {
        await tx.categoryGroup.updateMany({ where: { id, userId }, data: { sortOrder: index } });
      }
      return true;
    });
  }

  reorderCategories(userId: string, groupId: string, ids: readonly string[]): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const active = await tx.category.findMany({
        where: { userId, groupId, archivedAt: null },
        select: { id: true },
      });
      if (
        !isSameSet(
          active.map((row) => row.id),
          ids,
        )
      )
        return false;
      for (const [index, id] of ids.entries()) {
        await tx.category.updateMany({
          where: { id, userId, groupId },
          data: { sortOrder: index },
        });
      }
      return true;
    });
  }
}
