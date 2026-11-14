import type { CoachAnswerResponse, CoachFactResponse } from '@nestmint/shared';

/** What the coach knows about one user, gathered by the engine tools (never by the provider). */
export interface CoachFacts {
  question: string;
  health: CoachFactResponse[];
  ideas: CoachFactResponse[];
  goals: CoachFactResponse[];
  /** Whole-number totals the answer may quote. */
  savingsPerYearMkd: number;
  score: number | null;
}

/**
 * Writes the answer from facts. Today a rule-based provider does it; an LLM provider can replace it
 * without touching the tools, because it only ever receives these facts (ADR-035).
 */
export interface CoachProvider {
  readonly name: string;
  answer(facts: CoachFacts): Promise<CoachAnswerResponse>;
}

export const COACH_PROVIDER = Symbol('COACH_PROVIDER');
