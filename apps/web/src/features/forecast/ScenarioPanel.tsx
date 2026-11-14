import type { CategoriesResponse, ScenarioData, ScenarioResponse } from '@nestmint/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { formatMkd } from '../../format';
import { useAuth } from '../auth/AuthContext';
import { formatMonthYear } from '../goals/goalText';

const parseInt10 = (value: string): number | null => {
  const cleaned = value.replace(/[ ,]/g, '');
  if (cleaned === '' || !/^-?\d+$/.test(cleaned)) return null;
  return Number(cleaned);
};

/** NM-61: "what happens if…": change income or spending and see the future recalculated. */
export function ScenarioPanel({ months }: { months: number }) {
  const { authedGet, authedSend } = useAuth();
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [incomePercent, setIncomePercent] = useState('');
  const [expenseChange, setExpenseChange] = useState('');
  const [cutCategory, setCutCategory] = useState('');
  const [cutAmount, setCutAmount] = useState('');
  const [result, setResult] = useState<ScenarioResponse | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    authedGet<CategoriesResponse>('/categories')
      .then((data) => {
        if (!active) return;
        setCategories(
          data.groups.flatMap((g) => g.categories.map((c) => ({ id: c.id, name: c.name }))),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [authedGet]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setProblem(null);
    const body: Partial<ScenarioData> & { months: number } = { months };
    if (incomePercent.trim() !== '') {
      const value = Number(incomePercent.replace(',', '.'));
      if (Number.isNaN(value)) return setProblem('Enter income change as a number, for example 10');
      body.incomeChangePercent = value;
    }
    if (expenseChange.trim() !== '') {
      const value = parseInt10(expenseChange);
      if (value === null)
        return setProblem('Enter the spending change in whole denars, for example -2000');
      body.expenseChangeMkd = value;
    }
    if (cutCategory !== '') {
      const amount = parseInt10(cutAmount);
      if (amount === null || amount <= 0)
        return setProblem('Enter how much less to spend on it, for example 1000');
      body.cuts = [{ categoryId: cutCategory, reduceMkd: amount }];
    }
    setBusy(true);
    try {
      setResult(await authedSend<ScenarioResponse>('POST', '/forecast/scenario', body));
    } catch (error) {
      setResult(null);
      setProblem(
        error instanceof ApiError
          ? (Object.values(error.details)[0] ?? error.message)
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const field = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2';

  return (
    <section aria-label="What if" className="mt-6 rounded-lg border p-4">
      <h2 className="font-medium">What if…</h2>
      <form onSubmit={submit} className="mt-2 flex flex-col gap-3 text-sm">
        <label>
          My income changes by (%)
          <input
            inputMode="decimal"
            placeholder="for example 10"
            value={incomePercent}
            onChange={(e) => setIncomePercent(e.target.value)}
            className={field}
          />
        </label>
        <label>
          My spending changes by (MKD a month, negative = less)
          <input
            inputMode="numeric"
            placeholder="for example -2000"
            value={expenseChange}
            onChange={(e) => setExpenseChange(e.target.value)}
            className={field}
          />
        </label>
        <div className="flex gap-2">
          <label className="flex-1">
            Spend less on
            <select
              value={cutCategory}
              onChange={(e) => setCutCategory(e.target.value)}
              className={field}
            >
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="w-32">
            By (MKD a month)
            <input
              inputMode="numeric"
              value={cutAmount}
              onChange={(e) => setCutAmount(e.target.value)}
              className={field}
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="self-start rounded-lg bg-emerald-700 px-4 py-2 text-white disabled:opacity-60"
        >
          Calculate
        </button>
      </form>

      {problem && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {problem}
        </p>
      )}

      {result && <ScenarioResult result={result} months={months} />}
    </section>
  );
}

function ScenarioResult({ result, months }: { result: ScenarioResponse; months: number }) {
  const { extraPerMonthMkd, extraSavedMkd } = result;
  const same = extraPerMonthMkd === 0;
  return (
    <div className="mt-4 text-sm" aria-label="Result">
      <p>
        {same ? (
          'This changes nothing in the forecast.'
        ) : (
          <>
            <strong>
              {extraSavedMkd > 0 ? '+' : ''}
              {formatMkd(extraSavedMkd)}
            </strong>{' '}
            over {months} months
          </>
        )}
      </p>
      {!same && (
        <p className="mt-1 text-gray-600">
          Calculation: {formatMkd(extraPerMonthMkd)} {extraPerMonthMkd > 0 ? 'more' : 'less'} each
          month × {months} months = {formatMkd(extraSavedMkd)}.
        </p>
      )}
      <p className="mt-2">
        Put aside after {months} months: {formatMkd(result.baseline.totalNetMkd)} →{' '}
        <strong>{formatMkd(result.scenario.totalNetMkd)}</strong>
      </p>
      {result.scenario.endBalanceMkd !== null && result.baseline.endBalanceMkd !== null && (
        <p>
          Account balance: {formatMkd(result.baseline.endBalanceMkd)} →{' '}
          <strong>{formatMkd(result.scenario.endBalanceMkd)}</strong>
        </p>
      )}
      {result.cuts.map((c) => (
        <p key={c.categoryId} className="text-gray-600">
          {c.categoryName}: {formatMkd(c.usualMkd)} → {formatMkd(c.usualMkd - c.reduceMkd)} a month
          ({formatMkd(c.reduceMkd * 12)} a year).
        </p>
      ))}

      {result.goals.length > 0 && (
        <div className="mt-3">
          <p className="font-medium">Your goals, if the extra goes into each of them</p>
          <ul className="mt-1 list-disc pl-5">
            {result.goals.map((g) => (
              <li key={g.goalId}>
                {g.name}:{' '}
                {g.scenarioCompletionMonth === null
                  ? 'still no finish date'
                  : `${g.baselineCompletionMonth ? formatMonthYear(g.baselineCompletionMonth) : 'no date'} → ${formatMonthYear(g.scenarioCompletionMonth)}`}
                {g.monthsSooner !== null && g.monthsSooner > 0 && (
                  <>
                    {' '}
                    ({g.monthsSooner} month{g.monthsSooner === 1 ? '' : 's'} sooner)
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.healthBefore.score !== null && result.healthAfter.score !== null && (
        <p className="mt-3">
          Financial health score: {result.healthBefore.score} →{' '}
          <strong>{result.healthAfter.score}</strong>
        </p>
      )}
    </div>
  );
}
