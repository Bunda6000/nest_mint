import type { SavingsIdeasResponse } from '@nestmint/shared';
import { useEffect, useState } from 'react';
import { formatMkd } from '../../format';
import { useAuth } from '../auth/AuthContext';
import { currentMonth } from '../spending/months';

export interface IdeaPreset {
  categoryId: string;
  amountMkd: number;
}

/** NM-70: where the money could be saved, each idea with why it was raised and how it was calculated. */
export function SavingsIdeas({ onTry }: { onTry: (preset: IdeaPreset) => void }) {
  const { authedGet } = useAuth();
  const [data, setData] = useState<SavingsIdeasResponse | null>(null);

  useEffect(() => {
    let active = true;
    authedGet<SavingsIdeasResponse>(`/insights/ideas?month=${currentMonth()}`)
      .then((value) => active && setData(value))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [authedGet]);

  if (!data) return null;
  if (data.ideas.length === 0) {
    return (
      <section aria-label="Savings ideas" className="mt-6 rounded-lg border p-4 text-sm">
        <h2 className="font-medium">Savings ideas</h2>
        <p className="mt-1 text-gray-600">
          Ideas appear once you have a complete month of spending recorded.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Savings ideas" className="mt-6 rounded-lg border p-4">
      <h2 className="font-medium">Savings ideas</h2>
      {data.totalMonthlyMkd > 0 && (
        <p className="mt-1 text-sm text-gray-700">
          Following all of them: <strong>{formatMkd(data.totalMonthlyMkd)}</strong> a month,{' '}
          <strong>{formatMkd(data.totalYearlyMkd)}</strong> a year.
        </p>
      )}
      <ul className="mt-3 flex flex-col gap-3 text-sm">
        {data.ideas.map((idea) => (
          <li key={idea.id} className="rounded-lg bg-gray-50 p-3">
            <p className="font-medium">{idea.title}</p>
            <p className="mt-1 text-gray-700">{idea.why}</p>
            <p className="mt-1 text-gray-500">Calculation: {idea.method}</p>
            {idea.monthlyImpactMkd > 0 && (
              <button
                type="button"
                onClick={() =>
                  onTry({ categoryId: idea.categoryId, amountMkd: idea.monthlyImpactMkd })
                }
                aria-label={`Try “${idea.title}” in the what-if`}
                className="mt-2 text-emerald-700 underline"
              >
                Try it in the what-if
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
