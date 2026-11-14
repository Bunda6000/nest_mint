import { z } from 'zod';
import { isoDateSchema, monthSchema } from './transactions.js';

export const GOAL_KINDS = ['target', 'target_date', 'monthly'] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];
export const GOAL_STATUSES = [
  'done',
  'overdue',
  'on_track',
  'behind',
  'no_pace',
  'ongoing',
] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const MAX_GOAL_MKD = 1_000_000_000;
export const MAX_GOAL_NAME_LENGTH = 60;
export const MAX_GOAL_NOTE_LENGTH = 200;

/** A goal with its progress worked out (see the finance engine's goalProgress). */
export interface GoalResponse {
  id: string;
  name: string;
  kind: GoalKind;
  /** 1 = high, 2 = normal, 3 = low. */
  priority: 1 | 2 | 3;
  archived: boolean;
  targetMkd: number | null;
  /** "YYYY-MM": the last month to put money in; target_date goals only. */
  targetMonth: string | null;
  monthlyMkd: number | null;
  savedMkd: number;
  remainingMkd: number | null;
  /** 0 to 1; null for a monthly goal. */
  progress: number | null;
  monthsLeft: number | null;
  requiredMonthlyMkd: number | null;
  /** The pace the forecast used: the planned monthly amount, else the recent pace. */
  paceMkd: number;
  completionMonth: string | null;
  /** 0 to 100; pace ÷ required monthly, capped. Null without a deadline. */
  achievability: number | null;
  status: GoalStatus;
}

export interface GoalsResponse {
  goals: GoalResponse[];
}

export interface ContributionResponse {
  id: string;
  /** Positive = put in, negative = taken out. */
  amountMkd: number;
  occurredOn: string;
  note: string | null;
}

export interface ContributionsResponse {
  contributions: ContributionResponse[];
}

const nameSchema = z
  .string({ error: 'Enter a name' })
  .trim()
  .min(1, 'Enter a name')
  .max(MAX_GOAL_NAME_LENGTH, `At most ${MAX_GOAL_NAME_LENGTH} characters`);

const moneySchema = (what: string) =>
  z
    .number({ error: `Enter ${what}` })
    .int('Enter whole denars, for example 50000')
    .min(1, `${what[0]!.toUpperCase()}${what.slice(1)} must be above 0`)
    .max(MAX_GOAL_MKD, `Must be at most ${MAX_GOAL_MKD.toLocaleString('en-US')}`);

const prioritySchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const common = {
  name: nameSchema,
  priority: prioritySchema.default(2),
  /** What is already saved; recorded as a first contribution. */
  startingMkd: z.number().int().min(1).max(MAX_GOAL_MKD).optional(),
};

/** Create a goal. The kind decides which of the amounts are needed. */
export const createGoalSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('target'),
    ...common,
    targetMkd: moneySchema('the target'),
    monthlyMkd: moneySchema('the monthly amount').optional(),
  }),
  z.object({
    kind: z.literal('target_date'),
    ...common,
    targetMkd: moneySchema('the target'),
    targetMonth: monthSchema,
    monthlyMkd: moneySchema('the monthly amount').optional(),
  }),
  z.object({
    kind: z.literal('monthly'),
    ...common,
    monthlyMkd: moneySchema('the monthly amount'),
  }),
]);
export type CreateGoalData = z.output<typeof createGoalSchema>;

/** Change a goal's name, priority or amounts; the kind never changes. `archived` hides or restores it. */
export const updateGoalSchema = z
  .object({
    name: nameSchema.optional(),
    priority: prioritySchema.optional(),
    targetMkd: moneySchema('the target').optional(),
    targetMonth: monthSchema.optional(),
    monthlyMkd: moneySchema('the monthly amount').nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    message: 'Nothing to change',
  });
export type UpdateGoalData = z.output<typeof updateGoalSchema>;

/** Money put in (positive) or taken out (negative). */
export const addContributionSchema = z.object({
  amountMkd: z
    .number({ error: 'Enter an amount' })
    .int('Enter whole denars, for example 5000')
    .refine((v) => v !== 0, 'Amount cannot be 0')
    .refine((v) => Math.abs(v) <= MAX_GOAL_MKD, 'Amount is too large'),
  occurredOn: isoDateSchema,
  note: z
    .string()
    .trim()
    .max(MAX_GOAL_NOTE_LENGTH, `At most ${MAX_GOAL_NOTE_LENGTH} characters`)
    .optional(),
});
export type AddContributionData = z.output<typeof addContributionSchema>;
