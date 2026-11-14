import {
  type Adjustments,
  BASELINE_MONTHS,
  compareScenario,
  forecast as runForecast,
  type Forecast,
  type ForecastInput,
  goalProgress,
  incomeInMonth,
  monthsBetween,
  monthsEndingAt,
  shiftMonth,
  usualSpending,
} from '@nestmint/finance-engine';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  type CutResponse,
  ErrorCode,
  type ForecastBasisResponse,
  type ForecastResponse,
  type ForecastTotalsResponse,
  type GoalImpactResponse,
  type ScenarioData,
  type ScenarioResponse,
} from '@nestmint/shared';
import {
  BALANCE_CHECK_INS_REPOSITORY,
  type BalanceCheckInsRepository,
} from '../balance-check-ins/balance-check-ins.repository.js';
import { ApiException } from '../common/api.exception.js';
import { Clock } from '../common/clock.js';
import { GoalsService } from '../goals/goals.service.js';
import { HealthScoreService } from '../health-score/health-score.service.js';
import { INCOME_REPOSITORY, type IncomeRepository } from '../income/income.repository.js';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../transactions/transactions.repository.js';

interface Basis extends ForecastBasisResponse {
  input: Omit<ForecastInput, 'months'>;
  current: string;
}

const toTotals = (f: Forecast): ForecastTotalsResponse => ({
  months: f.months.map((m) => ({
    month: m.month,
    incomeMkd: m.income,
    expensesMkd: m.expenses,
    netMkd: m.net,
    cumulativeNetMkd: m.cumulativeNet,
    balanceMkd: m.balance,
  })),
  totalIncomeMkd: f.totalIncome,
  totalExpensesMkd: f.totalExpenses,
  totalNetMkd: f.totalNet,
  endBalanceMkd: f.endBalance,
  averageNetMkd: f.averageNet,
});

@Injectable()
export class ForecastService {
  constructor(
    @Inject(INCOME_REPOSITORY) private readonly income: IncomeRepository,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly transactions: TransactionsRepository,
    @Inject(BALANCE_CHECK_INS_REPOSITORY) private readonly checkIns: BalanceCheckInsRepository,
    private readonly goals: GoalsService,
    private readonly health: HealthScoreService,
    private readonly clock: Clock,
  ) {}

  /**
   * What the forecast stands on: the usual month's spending (average of the last complete months
   * that had any), the salaries as entered, and the balance (last check-in plus what happened
   * since). Every number is shown to the user so the forecast can be judged.
   */
  private async basis(userId: string): Promise<Basis & { pastMonths: string[] }> {
    const current = this.clock.now().toISOString().slice(0, 7);
    const previous = shiftMonth(current, -1);
    const baselineWindow = monthsEndingAt(previous, BASELINE_MONTHS);
    const checkIn = await this.checkIns.findBefore(userId, current);
    const from = checkIn ? [checkIn.month, baselineWindow[0]!].sort()[0]! : baselineWindow[0]!;

    const [sources, spent] = await Promise.all([
      this.income.list(userId),
      this.transactions.sumByMonth(userId, from, previous),
    ]);

    const withSpending = baselineWindow.filter((m) => (spent[m] ?? 0) > 0);
    const usualExpensesMkd = usualSpending(withSpending.map((m) => spent[m]!));

    let startingBalanceMkd: number | null = null;
    let startingBalanceFrom: string | null = null;
    if (checkIn) {
      startingBalanceMkd = checkIn.closingMkd;
      for (let m = shiftMonth(checkIn.month, 1); m <= previous; m = shiftMonth(m, 1)) {
        startingBalanceMkd += incomeInMonth(sources, m) - (spent[m] ?? 0);
      }
      startingBalanceFrom = checkIn.month;
    }

    return {
      current,
      pastMonths: withSpending,
      basedOnMonths: withSpending,
      usualExpensesMkd,
      startingBalanceMkd,
      startingBalanceFrom,
      input: { startMonth: current, sources, usualExpensesMkd, startingBalanceMkd },
    };
  }

  private describe(b: Basis): ForecastBasisResponse {
    return {
      basedOnMonths: b.basedOnMonths,
      usualExpensesMkd: b.usualExpensesMkd,
      startingBalanceMkd: b.startingBalanceMkd,
      startingBalanceFrom: b.startingBalanceFrom,
    };
  }

  async forecast(userId: string, months: number): Promise<ForecastResponse> {
    const basis = await this.basis(userId);
    return {
      ...this.describe(basis),
      forecast: toTotals(runForecast({ ...basis.input, months })),
    };
  }

  async scenario(userId: string, request: ScenarioData): Promise<ScenarioResponse> {
    const basis = await this.basis(userId);
    const cuts = await this.resolveCuts(userId, request, basis);
    const adjustments: Adjustments = {
      incomeChange: (request.incomeChangePercent ?? 0) / 100,
      expenseChangeMkd:
        (request.expenseChangeMkd ?? 0) - cuts.reduce((total, c) => total + c.reduceMkd, 0),
    };
    const compared = compareScenario({ ...basis.input, months: request.months }, adjustments);

    const [healthBefore, healthAfter, { goals }] = await Promise.all([
      this.health.compute(userId),
      this.health.compute(userId, adjustments),
      this.goals.list(userId),
    ]);

    const extra = Math.max(0, compared.extraPerMonthMkd);
    const impacts: GoalImpactResponse[] = goals
      .filter((g) => g.kind !== 'monthly' && g.targetMkd !== null && g.status !== 'done')
      .map((g) => {
        const after = goalProgress({
          kind: g.kind,
          targetMkd: g.targetMkd,
          targetMonth: g.targetMonth,
          monthlyMkd: null,
          savedMkd: g.savedMkd,
          recentPaceMkd: g.paceMkd + extra,
          currentMonth: basis.current,
        });
        const before = g.completionMonth;
        const scenarioMonth = after.completionMonth;
        return {
          goalId: g.id,
          name: g.name,
          baselineCompletionMonth: before,
          scenarioCompletionMonth: scenarioMonth,
          monthsSooner:
            before !== null && scenarioMonth !== null ? monthsBetween(scenarioMonth, before) : null,
        };
      });

    return {
      ...this.describe(basis),
      baseline: toTotals(compared.baseline),
      scenario: toTotals(compared.scenario),
      extraSavedMkd: compared.extraSavedMkd,
      extraPerMonthMkd: compared.extraPerMonthMkd,
      cuts,
      goals: impacts,
      healthBefore,
      healthAfter,
    };
  }

  /** Each cut must name a category that is spent in and not cut by more than its usual cost. */
  private async resolveCuts(
    userId: string,
    request: ScenarioData,
    basis: Basis & { pastMonths: string[] },
  ): Promise<CutResponse[]> {
    const wanted = request.cuts ?? [];
    if (wanted.length === 0) return [];
    if (new Set(wanted.map((c) => c.categoryId)).size !== wanted.length) {
      throw badCuts('Each category can be cut only once');
    }
    const months = basis.pastMonths;
    const perMonth = await Promise.all(
      months.map((m) => this.transactions.sumByCategory(userId, m)),
    );
    const usual = new Map<string, { name: string; total: number }>();
    for (const rows of perMonth) {
      for (const row of rows) {
        const entry = usual.get(row.categoryId) ?? { name: row.categoryName, total: 0 };
        entry.total += row.amountMkd;
        usual.set(row.categoryId, entry);
      }
    }
    return wanted.map((cut) => {
      const entry = usual.get(cut.categoryId);
      const usualMkd = entry ? Math.round(entry.total / Math.max(1, months.length)) : 0;
      if (!entry) throw badCuts('You have not spent anything in that category recently');
      if (cut.reduceMkd > usualMkd) {
        throw badCuts(`${entry.name} usually costs ${usualMkd} a month; you cannot cut more`);
      }
      return {
        categoryId: cut.categoryId,
        categoryName: entry.name,
        reduceMkd: cut.reduceMkd,
        usualMkd,
      };
    });
  }
}

const badCuts = (message: string) =>
  new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.ValidationFailed, 'Some fields are invalid.', {
    cuts: message,
  });
