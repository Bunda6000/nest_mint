import type { HealthFactorKey, HealthScoreResponse } from '@nestmint/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext';

const FACTOR_NAME: Record<HealthFactorKey, string> = {
  savings_rate: 'Savings rate',
  spending_ratio: 'Spending vs income',
  consistency: 'Consistency',
  goal_progress: 'Goal progress',
  emergency_fund: 'Emergency fund',
};

const LABEL: Record<NonNullable<HealthScoreResponse['label']>, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  needs_attention: 'Needs attention',
};

/** NM-51: the 0–100 score with every part and the numbers behind it. Quietly absent if it cannot load. */
export function HealthScoreCard() {
  const { authedGet } = useAuth();
  const [data, setData] = useState<HealthScoreResponse | null>(null);

  useEffect(() => {
    let active = true;
    authedGet<HealthScoreResponse>('/health-score')
      .then((value) => active && setData(value))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [authedGet]);

  if (!data) return null;
  if (data.score === null) {
    return (
      <section aria-label="Financial health" className="mt-4 rounded-lg border p-4 text-sm">
        <h2 className="font-medium">Financial health</h2>
        <p className="mt-1 text-gray-600">Add your income to see your score.</p>
      </section>
    );
  }

  return (
    <section aria-label="Financial health" className="mt-4 rounded-lg border p-4">
      <div className="flex items-baseline gap-3">
        <h2 className="font-medium">Financial health</h2>
        <span className="ml-auto text-3xl font-semibold" aria-label={`Score ${data.score} of 100`}>
          {data.score}
        </span>
        <span className="text-sm text-gray-600">/ 100 · {LABEL[data.label!]}</span>
      </div>

      {data.improvements.length > 0 && (
        <div className="mt-2 text-sm">
          <p className="font-medium">Where to improve</p>
          <ul className="mt-1 list-disc pl-5 text-gray-700">
            {data.improvements.map((f) => (
              <li key={f.key}>
                <strong>{FACTOR_NAME[f.key]}:</strong> {f.tip}
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-emerald-700">How is this worked out?</summary>
        <ul className="mt-2 flex flex-col gap-3">
          {data.factors.map((f) => (
            <li key={f.key}>
              <div className="flex justify-between">
                <span>
                  {FACTOR_NAME[f.key]} <span className="text-gray-500">({f.weight}% of score)</span>
                </span>
                <span>{f.score}/100</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full bg-emerald-600" style={{ width: `${f.score}%` }} />
              </div>
              <p className="mt-1 text-gray-600">{f.detail}</p>
            </li>
          ))}
        </ul>
        <Link to="/goals" className="mt-3 inline-block text-emerald-700 underline">
          Open savings goals
        </Link>
      </details>
    </section>
  );
}
