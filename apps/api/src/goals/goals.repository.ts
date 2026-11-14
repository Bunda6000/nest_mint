import type { GoalKind } from '@nestmint/shared';

export const GOALS_REPOSITORY = Symbol('GOALS_REPOSITORY');

export interface StoredGoal {
  id: string;
  name: string;
  kind: GoalKind;
  priority: 1 | 2 | 3;
  archived: boolean;
  targetMkd: number | null;
  /** "YYYY-MM". */
  targetMonth: string | null;
  monthlyMkd: number | null;
}

export interface NewGoal {
  name: string;
  kind: GoalKind;
  priority: 1 | 2 | 3;
  targetMkd: number | null;
  targetMonth: string | null;
  monthlyMkd: number | null;
}

export interface GoalChange {
  name?: string;
  priority?: 1 | 2 | 3;
  targetMkd?: number;
  targetMonth?: string;
  monthlyMkd?: number | null;
  archived?: boolean;
}

export interface StoredContribution {
  id: string;
  goalId: string;
  amountMkd: number;
  /** "YYYY-MM-DD". */
  occurredOn: string;
  note: string | null;
}

export interface NewContribution {
  amountMkd: number;
  occurredOn: string;
  note: string | null;
}

/**
 * Every method takes the owner's id and only ever touches that user's rows. Never add a method
 * that reads or writes goals without a userId (see docs/adr/006-user-data-isolation.md).
 */
export interface GoalsRepository {
  list(userId: string, includeArchived: boolean): Promise<StoredGoal[]>;
  find(userId: string, goalId: string): Promise<StoredGoal | null>;
  /** Creates the goal and, when given, its first contribution, in one step. */
  create(userId: string, goal: NewGoal, starting: NewContribution | null): Promise<StoredGoal>;
  /** Null when the goal is not the user's. */
  update(userId: string, goalId: string, change: GoalChange): Promise<StoredGoal | null>;
  /** Deletes the goal with its contributions. False when it is not the user's. */
  delete(userId: string, goalId: string): Promise<boolean>;

  /** All contributions of the user's goals (or of one goal), oldest first. */
  contributions(userId: string, goalId?: string): Promise<StoredContribution[]>;
  /** Null when the goal is not the user's. */
  addContribution(
    userId: string,
    goalId: string,
    contribution: NewContribution,
  ): Promise<StoredContribution | null>;
  deleteContribution(userId: string, goalId: string, contributionId: string): Promise<boolean>;
}
