import type { CreateIncomeData, IncomeResponse, IncomesResponse } from '@nestmint/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../../api/client';
import { useAuth } from '../auth/AuthContext';
import { IncomeForm } from './IncomeForm';
import { IncomeItem } from './IncomeItem';

type Load<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

export function IncomePage() {
  const { authedGet, authedSend } = useAuth();
  const [list, setList] = useState<Load<IncomesResponse>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    authedGet<IncomesResponse>('/income')
      .then((data) => active && setList({ status: 'ready', data }))
      .catch(() => active && setList({ status: 'error' }));
    return () => {
      active = false;
    };
  }, [authedGet, attempt]);

  const reload = () => setAttempt((n) => n + 1);

  async function add(values: CreateIncomeData) {
    await authedSend<IncomeResponse>('POST', '/income', values);
    setAdding(false);
    setProblem(null);
    reload();
  }

  async function edit(id: string, values: CreateIncomeData) {
    // The type cannot change, so only the fields that belong to it are sent.
    const body =
      values.recurrence === 'monthly'
        ? {
            name: values.name,
            amountMkd: values.amountMkd,
            startMonth: values.startMonth,
            endMonth: values.endMonth ?? null,
            payDay: values.payDay,
          }
        : { name: values.name, amountMkd: values.amountMkd, receivedOn: values.receivedOn };
    await authedSend('PATCH', `/income/${id}`, body);
    setProblem(null);
    reload();
  }

  async function remove(id: string) {
    try {
      await authedSend('DELETE', `/income/${id}`);
      setProblem(null);
    } catch (error) {
      // Already gone (for example deleted on another device): the refreshed list shows that.
      if (!(error instanceof ApiError && error.status === 404)) {
        setProblem(
          error instanceof ApiError ? error.message : 'Could not delete. Please try again.',
        );
      }
    }
    reload();
  }

  const busy = adding || editing;

  return (
    <section className="mx-auto max-w-md p-6">
      <Link to="/" className="text-sm text-emerald-700 underline">
        ← Back
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">Income</h1>

      {adding ? (
        <div className="mt-4 rounded-lg border p-4">
          <p className="mb-3 font-medium">Add income</p>
          <IncomeForm submitLabel="Save income" onSave={add} onCancel={() => setAdding(false)} />
        </div>
      ) : (
        <button
          type="button"
          disabled={editing}
          onClick={() => setAdding(true)}
          className="mt-4 w-full rounded-lg bg-emerald-700 px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          Add income
        </button>
      )}

      {problem && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {problem}
        </p>
      )}

      {list.status === 'loading' && (
        <p className="mt-6 text-gray-500" role="status">
          Loading…
        </p>
      )}

      {list.status === 'error' && (
        <div role="alert" className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          <p>Could not load your income.</p>
          <button
            type="button"
            onClick={() => {
              setList({ status: 'loading' });
              reload();
            }}
            className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      )}

      {list.status === 'ready' &&
        (list.data.incomes.length === 0 ? (
          <p className="mt-6 text-sm text-gray-500">
            No income yet. Add your salary to get started.
          </p>
        ) : (
          <ul className="mt-6 flex flex-col divide-y rounded-lg border">
            {list.data.incomes.map((income) => (
              <IncomeItem
                key={income.id}
                income={income}
                locked={busy}
                onEditing={setEditing}
                onEdit={(values) => edit(income.id, values)}
                onDelete={() => remove(income.id)}
              />
            ))}
          </ul>
        ))}
    </section>
  );
}
