import type {
  CategoriesResponse,
  CategoryResponse,
  CategoryUsageResponse,
  GroupResponse,
} from '@nestmint/shared';
import {
  type CategoriesRepository,
  type CategoryRecord,
  DuplicateNameError,
  type ItemChange,
} from '../categories/categories.repository.js';
import type { SeedGroup } from '../categories/categories.seed.js';
import { Clock } from '../common/clock.js';
import type {
  NewRefreshToken,
  RefreshTokenRecord,
  RefreshTokensRepository,
  RevokeReason,
} from '../auth/refresh-tokens.repository.js';
import type { NewUser, User } from '../users/user.entity.js';
import { DuplicateEmailError, type UsersRepository } from '../users/users.repository.js';

export class InMemoryUsers implements UsersRepository {
  readonly rows: User[] = [];
  raceOnCreate = false;

  async findById(id: string): Promise<User | null> {
    return this.rows.find((u) => u.id === id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.rows.find((u) => u.email === email) ?? null;
  }

  async listIds(): Promise<string[]> {
    return this.rows.map((u) => u.id);
  }

  async create(user: NewUser): Promise<User> {
    if (this.raceOnCreate) throw new DuplicateEmailError();
    const row: User = { id: `id-${this.rows.length + 1}`, displayName: null, ...user };
    this.rows.push(row);
    return row;
  }
}

interface StoredToken extends RefreshTokenRecord {
  tokenHash: string;
}

export class InMemoryRefreshTokens implements RefreshTokensRepository {
  readonly rows: StoredToken[] = [];

  async create(token: NewRefreshToken): Promise<void> {
    this.rows.push({
      id: `rt-${this.rows.length + 1}`,
      revokedAt: null,
      revokeReason: null,
      ...token,
    });
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.rows.find((r) => r.tokenHash === tokenHash) ?? null;
  }

  async revoke(id: string, reason: RevokeReason, at: Date): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) Object.assign(row, { revokedAt: at, revokeReason: reason });
  }

  async revokeAllForUser(userId: string, reason: RevokeReason, at: Date): Promise<void> {
    for (const row of this.rows) {
      if (row.userId === userId && !row.revokedAt) {
        Object.assign(row, { revokedAt: at, revokeReason: reason });
      }
    }
  }

  active(userId: string): number {
    return this.rows.filter((r) => r.userId === userId && !r.revokedAt).length;
  }
}

/** A clock the test can move forward. */
export class FakeClock extends Clock {
  private current = new Date('2026-11-08T10:00:00Z');

  override now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }

  /** Jump to a moment, forward or back. */
  set(date: Date): void {
    this.current = new Date(date);
  }
}

interface GroupRow {
  id: string;
  userId: string;
  name: string;
  sortOrder: number;
  archived: boolean;
}
interface CategoryRow extends GroupRow {
  groupId: string;
}

/** Behaves like the real repository: per-user rows, display order, archive rules, unique names. */
export class InMemoryCategories implements CategoriesRepository {
  readonly groups: GroupRow[] = [];
  readonly categories: CategoryRow[] = [];
  private readonly seeded = new Set<string>();
  private nextId = 1;
  seedCalls = 0;

  private id(): string {
    return `id-${this.nextId++}`;
  }

  private static byDisplay<T extends GroupRow>(rows: T[]): T[] {
    return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  private static same(a: string, b: string): boolean {
    return a.toLowerCase() === b.toLowerCase();
  }

  private static group(row: GroupRow): GroupResponse {
    return { id: row.id, name: row.name, archived: row.archived };
  }

  private static category(row: CategoryRow): CategoryResponse {
    return { id: row.id, groupId: row.groupId, name: row.name, archived: row.archived };
  }

  private ownGroup(userId: string, id: string): GroupRow | undefined {
    return this.groups.find((g) => g.id === id && g.userId === userId);
  }

  private ownCategory(userId: string, id: string): CategoryRow | undefined {
    return this.categories.find((c) => c.id === id && c.userId === userId);
  }

  async needsSeeding(userId: string): Promise<boolean> {
    return !this.seeded.has(userId);
  }

  async seedDefaultsOnce(userId: string, groups: readonly SeedGroup[]): Promise<void> {
    this.seedCalls += 1;
    if (this.seeded.has(userId)) return;
    this.seeded.add(userId);
    groups.forEach((group, sortOrder) => {
      const row: GroupRow = { id: this.id(), userId, name: group.name, sortOrder, archived: false };
      this.groups.push(row);
      group.categories.forEach((name, index) =>
        this.categories.push({
          id: this.id(),
          userId,
          groupId: row.id,
          name,
          sortOrder: index,
          archived: false,
        }),
      );
    });
  }

  async list(userId: string, includeArchived: boolean): Promise<CategoriesResponse> {
    const visible = <T extends GroupRow>(rows: T[]) =>
      InMemoryCategories.byDisplay(rows.filter((r) => includeArchived || !r.archived));
    return {
      groups: visible(this.groups.filter((g) => g.userId === userId)).map((group) => ({
        ...InMemoryCategories.group(group),
        categories: visible(
          this.categories.filter((c) => c.userId === userId && c.groupId === group.id),
        ).map(InMemoryCategories.category),
      })),
    };
  }

  async findGroup(userId: string, groupId: string): Promise<GroupResponse | null> {
    const row = this.ownGroup(userId, groupId);
    return row ? InMemoryCategories.group(row) : null;
  }

  async findGroupByName(userId: string, name: string): Promise<GroupResponse | null> {
    const row = this.groups.find(
      (g) => g.userId === userId && InMemoryCategories.same(g.name, name),
    );
    return row ? InMemoryCategories.group(row) : null;
  }

  async findCategory(userId: string, categoryId: string): Promise<CategoryRecord | null> {
    const row = this.ownCategory(userId, categoryId);
    if (!row) return null;
    return {
      ...InMemoryCategories.category(row),
      groupArchived: this.ownGroup(userId, row.groupId)?.archived ?? false,
    };
  }

  async findCategoryByName(
    userId: string,
    groupId: string,
    name: string,
  ): Promise<CategoryResponse | null> {
    const row = this.categories.find(
      (c) => c.userId === userId && c.groupId === groupId && InMemoryCategories.same(c.name, name),
    );
    return row ? InMemoryCategories.category(row) : null;
  }

  async createGroup(userId: string, name: string): Promise<GroupResponse> {
    const mine = this.groups.filter((g) => g.userId === userId);
    if (mine.some((g) => g.name === name)) throw new DuplicateNameError();
    const row: GroupRow = {
      id: this.id(),
      userId,
      name,
      sortOrder: Math.max(-1, ...mine.map((g) => g.sortOrder)) + 1,
      archived: false,
    };
    this.groups.push(row);
    return InMemoryCategories.group(row);
  }

  async createCategory(userId: string, groupId: string, name: string): Promise<CategoryResponse> {
    if (!this.ownGroup(userId, groupId)) throw new Error('foreign key violation');
    const siblings = this.categories.filter((c) => c.userId === userId && c.groupId === groupId);
    if (siblings.some((c) => c.name === name)) throw new DuplicateNameError();
    const row: CategoryRow = {
      id: this.id(),
      userId,
      groupId,
      name,
      sortOrder: Math.max(-1, ...siblings.map((c) => c.sortOrder)) + 1,
      archived: false,
    };
    this.categories.push(row);
    return InMemoryCategories.category(row);
  }

  async updateGroup(
    userId: string,
    groupId: string,
    change: ItemChange,
  ): Promise<GroupResponse | null> {
    const row = this.ownGroup(userId, groupId);
    if (!row) return null;
    if (change.name !== undefined) row.name = change.name;
    if (change.archived === true && !row.archived) {
      row.archived = true;
      for (const c of this.categories) {
        if (c.userId === userId && c.groupId === groupId) c.archived = true;
      }
    } else if (change.archived === false && row.archived) {
      row.archived = false;
      row.sortOrder =
        Math.max(-1, ...this.groups.filter((g) => g.userId === userId).map((g) => g.sortOrder)) + 1;
    }
    return InMemoryCategories.group(row);
  }

  async updateCategory(
    userId: string,
    categoryId: string,
    change: ItemChange,
  ): Promise<CategoryResponse | null> {
    const row = this.ownCategory(userId, categoryId);
    if (!row) return null;
    if (change.name !== undefined) row.name = change.name;
    if (change.groupId !== undefined && change.groupId !== row.groupId) {
      row.sortOrder =
        Math.max(
          -1,
          ...this.categories
            .filter((c) => c.userId === userId && c.groupId === change.groupId)
            .map((c) => c.sortOrder),
        ) + 1;
      row.groupId = change.groupId;
    }
    if (change.archived === true) row.archived = true;
    if (change.archived === false && row.archived) {
      row.archived = false;
      row.sortOrder =
        Math.max(
          -1,
          ...this.categories
            .filter((c) => c.userId === userId && c.groupId === row.groupId)
            .map((c) => c.sortOrder),
        ) + 1;
    }
    return InMemoryCategories.category(row);
  }

  /** What tests say is using each category (the fake has no transactions of its own). */
  readonly usage = new Map<string, CategoryUsageResponse>();

  async categoryUsage(userId: string, categoryId: string): Promise<CategoryUsageResponse> {
    void userId;
    return this.usage.get(categoryId) ?? { transactions: 0, obligations: 0 };
  }

  async mergeCategory(
    userId: string,
    sourceId: string,
    targetId: string,
  ): Promise<CategoryUsageResponse | null> {
    const source = this.ownCategory(userId, sourceId);
    if (!source || !this.ownCategory(userId, targetId)) return null;
    const moved = await this.categoryUsage(userId, sourceId);
    const target = await this.categoryUsage(userId, targetId);
    this.usage.set(targetId, {
      transactions: target.transactions + moved.transactions,
      obligations: target.obligations + moved.obligations,
    });
    this.usage.delete(sourceId);
    source.archived = true;
    return moved;
  }

  private reorder(rows: GroupRow[], ids: readonly string[]): boolean {
    const active = rows.filter((r) => !r.archived);
    const matches =
      active.length === ids.length &&
      new Set(ids).size === ids.length &&
      ids.every((id) => active.some((r) => r.id === id));
    if (!matches) return false;
    ids.forEach((id, index) => (rows.find((r) => r.id === id)!.sortOrder = index));
    return true;
  }

  async reorderGroups(userId: string, ids: readonly string[]): Promise<boolean> {
    return this.reorder(
      this.groups.filter((g) => g.userId === userId),
      ids,
    );
  }

  async reorderCategories(
    userId: string,
    groupId: string,
    ids: readonly string[],
  ): Promise<boolean> {
    return this.reorder(
      this.categories.filter((c) => c.userId === userId && c.groupId === groupId),
      ids,
    );
  }
}
