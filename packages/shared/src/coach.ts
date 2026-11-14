import { z } from 'zod';

export const coachQuestionSchema = z.object({
  question: z.string().trim().min(2).max(500),
});
export type CoachQuestionData = z.infer<typeof coachQuestionSchema>;

/** One piece of data the answer is built on, so the user can see where it came from (NM-80). */
export interface CoachFactResponse {
  /** Which engine tool produced it. */
  source: 'health_score' | 'savings_ideas' | 'goals';
  text: string;
}

/** The coach always explains: what it says, why, and the numbers behind it. */
export interface CoachAnswerResponse {
  answer: string;
  why: string;
  facts: CoachFactResponse[];
  /** Which provider wrote the answer: "rules" today, an LLM later. */
  provider: string;
}
