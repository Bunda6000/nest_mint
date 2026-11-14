import { z } from 'zod';
import type { HealthScoreResponse } from './health-score.js';

export const FORECAST_MAX_MONTHS = 60;
export const FORECAST_MAX_CUTS = 10;
const MAX_CHANGE_MKD = 100_000_000;

export interface ForecastMonthResponse {
  month: string;
  incomeMkd: number;
  expensesMkd: number;
  netMkd: number;
  /** Net of this month and every forecast month before it. */
  cumulativeNetMkd: number;
  /** End-of-month balance of the main account; null when no balance check-in exists. */
  balanceMkd: number | null;
}

export interface ForecastTotalsResponse {
  months: ForecastMonthResponse[];
  totalIncomeMkd: number;
  totalExpensesMkd: number;
  totalNetMkd: number;
  endBalanceMkd: number | null;
  averageNetMkd: number;
}

/** What the forecast is built on, so the user can judge it. */
export interface ForecastBasisResponse {
  /** The complete past months the usual spending was averaged over. */
  basedOnMonths: string[];
  usualExpensesMkd: number;
  /** The balance the forecast starts from, and where it came from; null if no check-in exists. */
  startingBalanceMkd: number | null;
  startingBalanceFrom: string | null;
}

export interface ForecastResponse extends ForecastBasisResponse {
  forecast: ForecastTotalsResponse;
}

export interface CutResponse {
  categoryId: string;
  categoryName: string;
  reduceMkd: number;
  /** What the category usually costs per month. */
  usualMkd: number;
}

export interface GoalImpactResponse {
  goalId: string;
  name: string;
  /** "YYYY-MM"; null when it cannot be forecast. */
  baselineCompletionMonth: string | null;
  scenarioCompletionMonth: string | null;
  /** Months earlier it finishes; null when either end is unknown. */
  monthsSooner: number | null;
}

export interface ScenarioResponse extends ForecastBasisResponse {
  baseline: ForecastTotalsResponse;
  scenario: ForecastTotalsResponse;
  extraSavedMkd: number;
  extraPerMonthMkd: number;
  cuts: CutResponse[];
  goals: GoalImpactResponse[];
  /** The score today and the score if the past months had looked like the scenario. */
  healthBefore: HealthScoreResponse;
  healthAfter: HealthScoreResponse;
}

const horizon = z
  .number({ error: 'Choose a number of months' })
  .int('Choose whole months')
  .min(1, 'At least 1 month')
  .max(FORECAST_MAX_MONTHS, `At most ${FORECAST_MAX_MONTHS} months`);

/** What-if: every change is optional. Percentages are of income; amounts are per month, in denars. */
export const scenarioSchema = z.object({
  months: horizon.default(12),
  /** −100 to 500, one decimal: 10 means income 10 % higher. */
  incomeChangePercent: z.number().min(-100).max(500).optional(),
  /** Added to the monthly spending; negative spends less. */
  expenseChangeMkd: z.number().int().min(-MAX_CHANGE_MKD).max(MAX_CHANGE_MKD).optional(),
  /** Spend less in named categories, each by a monthly amount (at most what it usually costs). */
  cuts: z
    .array(
      z.object({
        categoryId: z.uuid(),
        reduceMkd: z.number().int().min(1).max(MAX_CHANGE_MKD),
      }),
    )
    .max(FORECAST_MAX_CUTS)
    .optional(),
});
export type ScenarioData = z.output<typeof scenarioSchema>;

export const forecastQuerySchema = z.object({ months: horizon });
