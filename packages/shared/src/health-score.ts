export type HealthFactorKey =
  'savings_rate' | 'spending_ratio' | 'goal_progress' | 'consistency' | 'emergency_fund';

export interface HealthFactorResponse {
  key: HealthFactorKey;
  /** 0 to 100. */
  score: number;
  /** Share of the total, in percent; the shares add up to 100. */
  weight: number;
  /** The calculation behind the score. */
  detail: string;
  /** What would raise it. */
  tip: string;
}

/** The financial health score of NM-51: 0 to 100 with its parts, so the number is never a mystery. */
export interface HealthScoreResponse {
  /** Null until there is a month with income to judge. */
  score: number | null;
  label: 'excellent' | 'good' | 'fair' | 'needs_attention' | null;
  /** The months the score looked at, oldest first ("YYYY-MM"). */
  months: string[];
  factors: HealthFactorResponse[];
  improvements: HealthFactorResponse[];
}
