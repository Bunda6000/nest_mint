import { Injectable } from '@nestjs/common';
import type { CoachAnswerResponse } from '@nestmint/shared';
import type { CoachFacts, CoachProvider } from './coach.provider.js';

type Topic = 'savings' | 'score' | 'goals' | 'overview';

const KEYWORDS: Record<Exclude<Topic, 'overview'>, RegExp> = {
  savings: /sav(e|ing)|cut|reduc|spend|cheap|expens|cost|trim|waste/i,
  score: /score|health|how am i|doing/i,
  goals: /goal|target|reach|deadline|car|vacation|fund/i,
};

function topicOf(question: string): Topic {
  if (KEYWORDS.score.test(question)) return 'score';
  if (KEYWORDS.goals.test(question)) return 'goals';
  if (KEYWORDS.savings.test(question)) return 'savings';
  return 'overview';
}

/** Answers from the facts with fixed rules. No guessing: if there is nothing to say, it says so. */
@Injectable()
export class RuleBasedCoachProvider implements CoachProvider {
  readonly name = 'rules';

  async answer(facts: CoachFacts): Promise<CoachAnswerResponse> {
    const topic = topicOf(facts.question);
    const base = { provider: this.name };

    if (topic === 'score') {
      if (facts.score === null || facts.health.length === 0) {
        return {
          ...base,
          answer: 'There is no score yet: I need at least one month with income and spending.',
          why: 'The score is built from your monthly income and spending.',
          facts: [],
        };
      }
      return {
        ...base,
        answer: `Your financial health score is ${facts.score} out of 100. ${facts.health[facts.health.length - 1]!.text}`,
        why: 'The score is a weighted mix of savings rate, emergency fund, spending ratio, goal progress and consistency; the weakest part is the quickest to improve.',
        facts: facts.health,
      };
    }

    if (topic === 'goals') {
      if (facts.goals.length === 0) {
        return {
          ...base,
          answer: 'You have no savings goals yet. Add one and I can tell you if it is reachable.',
          why: 'Goal advice needs a target and a date.',
          facts: [],
        };
      }
      return {
        ...base,
        answer: facts.goals[0]!.text,
        why: 'Achievability is your current monthly pace divided by the monthly amount the goal needs.',
        facts: facts.goals,
      };
    }

    if (topic === 'savings' || topic === 'overview') {
      if (facts.ideas.length === 0) {
        return {
          ...base,
          answer: 'I have no savings ideas yet: I need a complete month of spending first.',
          why: 'Ideas come from comparing your categories over the last months.',
          facts: [],
        };
      }
      return {
        ...base,
        answer:
          `The best place to start: ${facts.ideas[0]!.text} ` +
          `All ideas together could free about ${facts.savingsPerYearMkd.toLocaleString('en-US')} MKD a year.`,
        why: 'Ideas are ranked by how much they save in a year, each with its calculation.',
        facts: facts.ideas,
      };
    }
    return { ...base, answer: '', why: '', facts: [] };
  }
}
