import {
  type CategoriesResponse,
  type TransactionKind,
  type TransactionResponse,
  type TransactionsResponse,
} from '@nestmint/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { formatMkd } from '../../format';
import { useAuth } from '../auth/AuthContext';
import { ExpenseForm, type ExpenseValues } from './ExpenseForm';
import { RecentExpenses } from './RecentExpenses';

type Load<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

const RECENT = 10;
/** The default category that cash withdrawals are booked under (Banks → Cash withdrawal). */
const WITHDRAWAL_CATEGORY = 'Cash withdrawal';

export function AddExpensePage() {
  const { authedGet, authedSend } = useAuth();
  const [categories, setCategories] = useState<Load<CategoriesResponse>>({ status: 'loading' });
  const [recent, setRecent] = useState<Load<TransactionsResponse>>({ status: 'loading' });
  const [categoriesAttempt, setCategoriesAttempt] = useState(0);
  const [recentAttempt, setRecentAttempt] = useState(0);
  const [kind, setKind] = useState<TransactionKind>('expense');
  const [saved, setSaved] = useState<TransactionResponse | null>(null);

  useEffect(() => {
    let active = true;
    authedGet<CategoriesResponse>('/categories')
      .then((data) => active && setCategories({ status: 'ready', data }))
      .catch(() => active && setCategories({ status: 'error' }));
    return () => {
      active = false;
    };
  }, [authedGet, categoriesAttempt]);

  useEffect(() => {
    let active = true;
    authedGet<TransactionsResponse>(`/transactions?limit=${RECENT}`)
      .then((data) => active && setRecent({ status: 'ready', data }))
      .catch(() => active && setRecent({ status: 'error' }));
    return () => {
      active = false;
    };
  }, [authedGet, recentAttempt]);

  /** In cash withdrawal mode the withdrawal category is selected for you, if it still exists. */
  const preferredCategoryId = useMemo(() => {
    if (kind !== 'cash_withdrawal' || categories.status !== 'ready') return '';
    const found = categories.data.groups
      .flatMap((group) => group.categories)
      .find((category) => category.name === WITHDRAWAL_CATEGORY);
    return found?.id ?? '';
  }, [kind, categories]);

  async function save(values: ExpenseValues) {
    const expense = await authedSend<TransactionResponse>('POST', '/transactions', {
      ...values,
      ...(kind === 'cash_withdrawal' ? { kind } : {}),
    });
    setSaved(expense);
    setRecentAttempt((n) => n + 1);
  }

  return (
    <section className="mx-auto max-w-md p-6">
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm text-emerald-700 underline">
          ← Back
        </Link>
        <Link to="/transactions" className="text-sm text-emerald-700 underline">
          All expenses
        </Link>
      </div>
      <h1 className="mt-3 text-2xl font-semibold">Add expense</h1>

      {categories.status === 'loading' && (
        <p className="mt-6 text-gray-500" role="status">
          Loading categories…
        </p>
      )}

      {categories.status === 'error' && (
        <div role="alert" className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          <p>Could not load your categories.</p>
          <button
            type="button"
            onClick={() => {
              setCategories({ status: 'loading' });
              setCategoriesAttempt((n) => n + 1);
            }}
            className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      )}

      {categories.status === 'ready' && (
        <div className="mt-6 flex flex-col gap-5">
          <fieldset>
            <legend className="text-sm font-medium text-gray-700">Type</legend>
            <div className="mt-2 flex gap-2">
              {(
                [
                  ['expense', 'Expense'],
                  ['cash_withdrawal', 'Withdraw cash'],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="cursor-pointer rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-700 has-checked:bg-emerald-700 has-checked:text-white has-focus-visible:ring-2 has-focus-visible:ring-emerald-500"
                >
                  <input
                    type="radio"
                    name="kind"
                    value={value}
                    checked={kind === value}
                    onChange={() => setKind(value)}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
            {kind === 'cash_withdrawal' && (
              <p className="mt-2 text-sm text-gray-500">
                Money taken out of the bank account. It counts as an expense.
              </p>
            )}
          </fieldset>

          <ExpenseForm
            groups={categories.data.groups}
            submitLabel="Save expense"
            clearAfterSave
            preferredCategoryId={preferredCategoryId}
            onAttempt={() => setSaved(null)}
            onSave={save}
            onCategoryUnavailable={() => setCategoriesAttempt((n) => n + 1)}
          />

          {saved && (
            <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              Saved: {formatMkd(saved.amountMkd)} · {saved.categoryName}
            </p>
          )}
        </div>
      )}

      <h2 className="mt-8 text-lg font-semibold">Recent expenses</h2>
      {recent.status === 'loading' && (
        <p className="mt-3 text-sm text-gray-500">Loading recent expenses…</p>
      )}
      {recent.status === 'error' && (
        <p className="mt-3 text-sm text-red-700">
          Could not load recent expenses.{' '}
          <button
            type="button"
            onClick={() => {
              setRecent({ status: 'loading' });
              setRecentAttempt((n) => n + 1);
            }}
            className="underline"
          >
            Try again
          </button>
        </p>
      )}
      {recent.status === 'ready' && <RecentExpenses expenses={recent.data.transactions} />}
    </section>
  );
}
