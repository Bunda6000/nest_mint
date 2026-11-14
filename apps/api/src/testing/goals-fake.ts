import { randomUUID } from 'node:crypto';
import type {
  GoalChange,
  GoalsRepository,
  NewContribution,
  NewGoal,
  StoredContribution,
  StoredGoal,
} from '../goals/goals.repository.js';

/** Keeps each user's goals apart, like the real repository. */
export class InMemoryGoals implements GoalsRepository {
  readonly goals: (StoredGoal & { userId: string; createdAt: number })[] = [];
  readonly rows: (StoredContribution & { userId: string })[] = [];
  private tick = 0;

  private strip({
    userId: _u,
    createdAt: _c,
    ...goal
  }: StoredGoal & { userId: string; createdAt: number }): StoredGoal {
    void _u;
    void _c;
    return goal;
  }

  private own(userId: string, goalId: string) {
    return this.goals.find((g) => g.userId === userId && g.id === goalId);
  }

  async list(userId: string, includeArchived: boolean): Promise<StoredGoal[]> {
    return this.goals
      .filter((g) => g.userId === userId && (includeArchived || !g.archived))
      .sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt)
      .map((g) => this.strip(g));
  }

  async find(userId: string, goalId: string): Promise<StoredGoal | null> {
    const goal = this.own(userId, goalId);
    return goal ? this.strip(goal) : null;
  }

  async create(
    userId: string,
    goal: NewGoal,
    starting: NewContribution | null,
  ): Promise<StoredGoal> {
    const row = { ...goal, id: randomUUID(), userId, archived: false, createdAt: this.tick++ };
    this.goals.push(row);
    if (starting) await this.addContribution(userId, row.id, starting);
    return this.strip(row);
  }

  async update(userId: string, goalId: string, change: GoalChange): Promise<StoredGoal | null> {
    const goal = this.own(userId, goalId);
    if (!goal) return null;
    for (const [key, value] of Object.entries(change)) {
      if (value !== undefined) (goal as unknown as Record<string, unknown>)[key] = value;
    }
    return this.strip(goal);
  }

  async delete(userId: string, goalId: string): Promise<boolean> {
    const index = this.goals.findIndex((g) => g.userId === userId && g.id === goalId);
    if (index < 0) return false;
    this.goals.splice(index, 1);
    for (let i = this.rows.length - 1; i >= 0; i--) {
      if (this.rows[i]!.goalId === goalId) this.rows.splice(i, 1);
    }
    return true;
  }

  async contributions(userId: string, goalId?: string): Promise<StoredContribution[]> {
    return this.rows
      .filter((c) => c.userId === userId && (!goalId || c.goalId === goalId))
      .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn))
      .map((row) => ({
        id: row.id,
        goalId: row.goalId,
        amountMkd: row.amountMkd,
        occurredOn: row.occurredOn,
        note: row.note,
      }));
  }

  async addContribution(
    userId: string,
    goalId: string,
    contribution: NewContribution,
  ): Promise<StoredContribution | null> {
    if (!this.own(userId, goalId)) return null;
    const row = { id: randomUUID(), goalId, userId, ...contribution };
    this.rows.push(row);
    const { userId: _u, ...rest } = row;
    void _u;
    return rest;
  }

  async deleteContribution(
    userId: string,
    goalId: string,
    contributionId: string,
  ): Promise<boolean> {
    const index = this.rows.findIndex(
      (c) => c.userId === userId && c.goalId === goalId && c.id === contributionId,
    );
    if (index < 0) return false;
    this.rows.splice(index, 1);
    return true;
  }
}
