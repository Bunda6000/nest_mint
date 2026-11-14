import type { CreateGoalData, GoalsResponse } from '@nestmint/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../../api/client';
import { useAuth } from '../auth/AuthContext';
import { GoalCard } from './GoalCard';
import { NewGoalForm } from './NewGoalForm';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: GoalsResponse };

/** Phase 2: savings goals with progress and the monthly amount needed. */
export function GoalsPage() {
  const { authedGet, authedSend } = useAuth();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    authedGet<GoalsResponse>(showArchived ? '/goals?includeArchived=true' : '/goals')
      .then((data) => active && setLoad({ status: 'ready', data }))
      .catch(() => active && setLoad({ status: 'error' }));
    return () => {
      active = false;
    };
  }, [authedGet, attempt, showArchived]);

  async function run(change: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setProblem(null);
    try {
      await change();
      setAttempt((n) => n + 1);
      return true;
    } catch (error) {
      setProblem(
        error instanceof ApiError
          ? (Object.values(error.details)[0] ?? error.message)
          : 'Something went wrong. Please try again.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  const goals = load.status === 'ready' ? load.data.goals : [];

  return (
    <section className="mx-auto max-w-md p-4">
      <Link to="/" className="text-emerald-700 underline">
        ← Home
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Savings goals</h1>

      {load.status === 'loading' && (
        <p role="status" className="mt-4 text-gray-500">
          Loading goals…
        </p>
      )}
      {load.status === 'error' && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          Could not load your goals.{' '}
          <button type="button" className="underline" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </p>
      )}
      {problem && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {problem}
        </p>
      )}

      {load.status === 'ready' && (
        <>
          {goals.length === 0 && !adding && (
            <p className="mt-4 text-gray-600">
              No goals yet. A goal turns “I should save” into a number you can follow.
            </p>
          )}
          <ul className="mt-4 flex flex-col gap-3">
            {goals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                busy={busy}
                onContribute={(id, amountMkd, occurredOn) =>
                  run(() =>
                    authedSend('POST', `/goals/${id}/contributions`, { amountMkd, occurredOn }),
                  )
                }
                onArchive={(id, archived) =>
                  void run(() => authedSend('PATCH', `/goals/${id}`, { archived }))
                }
              />
            ))}
          </ul>

          {adding ? (
            <NewGoalForm
              busy={busy}
              onCancel={() => setAdding(false)}
              onCreate={async (data: CreateGoalData) => {
                const ok = await run(() => authedSend('POST', '/goals', data));
                if (ok) setAdding(false);
                return ok;
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mt-4 text-sm text-emerald-700 underline"
            >
              + New goal
            </button>
          )}

          <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show archived
          </label>
        </>
      )}
    </section>
  );
}
