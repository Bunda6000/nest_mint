import { describe, expect, it } from 'vitest';
import type { CoachFacts } from './coach.provider.js';
import { RuleBasedCoachProvider } from './rule-based-coach.provider.js';

const facts = (question: string, over: Partial<CoachFacts> = {}): CoachFacts => ({
  question,
  health: [
    { source: 'health_score', text: 'savings rate: 40/100 (saved 10% of income)' },
    { source: 'health_score', text: 'Biggest room to improve is savings rate: save more.' },
  ],
  ideas: [{ source: 'savings_ideas', text: 'Spend 1,500 MKD less on Restaurants. 15% of 10,000.' }],
  goals: [{ source: 'goals', text: 'Car: 60% achievable at your pace of 5,000 MKD a month.' }],
  savingsPerYearMkd: 18_000,
  score: 62,
  ...over,
});

describe('RuleBasedCoachProvider', () => {
  const provider = new RuleBasedCoachProvider();

  it('quotes the score and explains it', async () => {
    const a = await provider.answer(facts('What is my health score?'));
    expect(a.answer).toContain('62 out of 100');
    expect(a.why).toContain('weighted');
    expect(a.facts).toHaveLength(2);
  });

  it('leads with the best saving idea and the yearly total', async () => {
    const a = await provider.answer(facts('Where can I cut spending?'));
    expect(a.answer).toContain('Restaurants');
    expect(a.answer).toContain('18,000 MKD a year');
  });

  it('answers goal questions from goal facts', async () => {
    const a = await provider.answer(facts('Will I reach my car goal?'));
    expect(a.answer).toContain('60% achievable');
  });

  it('does not invent a score without data', async () => {
    const a = await provider.answer(facts('my score?', { score: null, health: [] }));
    expect(a.answer).toContain('no score yet');
  });
});
