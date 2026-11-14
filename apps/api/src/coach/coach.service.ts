import { Inject, Injectable } from '@nestjs/common';
import type { CoachAnswerResponse, CoachFactResponse } from '@nestmint/shared';
import { Clock } from '../common/clock.js';
import { GoalsService } from '../goals/goals.service.js';
import { HealthScoreService } from '../health-score/health-score.service.js';
import { InsightsService } from '../insights/insights.service.js';
import { COACH_PROVIDER, type CoachProvider } from './coach.provider.js';

/**
 * The coach (NM-80): the engine tools collect the facts, the provider only words them.
 * Every number in an answer therefore comes from the same calculations the screens use.
 */
@Injectable()
export class CoachService {
  constructor(
    private readonly health: HealthScoreService,
    private readonly insights: InsightsService,
    private readonly goals: GoalsService,
    private readonly clock: Clock,
    @Inject(COACH_PROVIDER) private readonly provider: CoachProvider,
  ) {}

  async ask(userId: string, question: string): Promise<CoachAnswerResponse> {
    const month = this.clock.now().toISOString().slice(0, 7);
    const [score, ideas, { goals }] = await Promise.all([
      this.health.compute(userId),
      this.insights.ideas(userId, month),
      this.goals.list(userId),
    ]);

    const health: CoachFactResponse[] = [
      ...score.factors.map((f) => ({
        source: 'health_score' as const,
        text: `${f.key.replace('_', ' ')}: ${f.score}/100 (${f.detail})`,
      })),
      ...score.improvements.slice(0, 1).map((f) => ({
        source: 'health_score' as const,
        text: `Biggest room to improve is ${f.key.replace('_', ' ')}: ${f.tip}`,
      })),
    ];
    // The last health fact is the tip, which the provider quotes.
    const ideaFacts = ideas.ideas.map((i) => ({
      source: 'savings_ideas' as const,
      text: `${i.title}. ${i.method}`,
    }));
    const goalFacts = goals
      .filter((g) => !g.archived)
      .map((g) => ({
        source: 'goals' as const,
        text:
          g.achievability === null
            ? `${g.name}: ${g.savedMkd.toLocaleString('en-US')} MKD saved, pace ${g.paceMkd.toLocaleString('en-US')} MKD a month.`
            : `${g.name}: ${g.achievability}% achievable at your pace of ${g.paceMkd.toLocaleString('en-US')} MKD a month (needs ${(g.requiredMonthlyMkd ?? 0).toLocaleString('en-US')}).`,
      }));

    return this.provider.answer({
      question,
      health,
      ideas: ideaFacts,
      goals: goalFacts,
      savingsPerYearMkd: ideas.totalYearlyMkd,
      score: score.score,
    });
  }
}
