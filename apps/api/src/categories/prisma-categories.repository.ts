import { Injectable } from '@nestjs/common';
import type { CategoriesResponse } from '@nestmint/shared';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CategoriesRepository } from './categories.repository.js';
import type { SeedGroup } from './categories.seed.js';

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

  async list(userId: string): Promise<CategoriesResponse> {
    const groups = await this.prisma.categoryGroup.findMany({
      where: { userId },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        categories: {
          where: { userId },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, name: true },
        },
      },
    });
    return { groups };
  }
}
