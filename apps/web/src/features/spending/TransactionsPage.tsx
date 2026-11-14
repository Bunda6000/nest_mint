import { convertMkdToEur } from '@nestmint/finance-engine';
import type { CategoriesResponse, MonthTransactionsResponse } from '@nestmint/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../../api/client';
import { formatEurCents, formatMkd } from '../../format';
import { useAuth } from '../auth/AuthContext';
import type { ExpenseValues } from './ExpenseForm';
import { currentMonth, formatMonth, lastDayOfMonth, shiftMonth } from './months';
import { TransactionItem } from './TransactionItem';
import { useT } from '../../i18n/translate';

type Load<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

export function TransactionsPage() {
  const { authedGet, authedSend } = useAuth();
  const { category: label, t } = useT();
  const thisMonth = currentMonth();
  const [month, setMonth] = useState(thisMonth);
  const [categoryId, setCategoryId] = useState('');
  const [list, setList] = useState<Load<MonthTransactionsResponse>>({ status: 'loading' });
  const [categories, setCategories] = useState<Load<CategoriesResponse>>({ status: 'loading' });
  const [listAttempt, setListAttempt] = useState(0);
  const [categoriesAttempt, setCategoriesAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const filter = categoryId ? `&categoryId=${categoryId}` : '';
    authedGet<MonthTransactionsResponse>(`/transactions?month=${month}${filter}`)
      .then((data) => active && setList({ status: 'ready', data }))
      .catch(() => active && setList({ status: 'error' }));
    return () => {
      active = false;
    };
  }, [authedGet, month, categoryId, listAttempt]);

  useEffect(() => {
    let active = true;
    // Archived categories too: old expenses can still belong to them.
    authedGet<CategoriesResponse>('/categories?includeArchived=true')
      .then((data) => active && setCategories({ status: 'ready', data }))
      .catch(() => active && setCategories({ status: 'error' }));
    return () => {
      active = false;
    };
  }, [authedGet, categoriesAttempt]);

  const reload = () => setListAttempt((n) => n + 1);

  function goTo(next: string) {
    setList({ status: 'loading' });
    setProblem(null);
    setMonth(next);
  }

  async function edit(id: string, values: ExpenseValues) {
    await authedSend('PATCH', `/transactions/${id}`, {
      categoryId: values.categoryId,
      amountMkd: values.amountMkd,
      occurredOn: values.occurredOn,
      note: values.note ?? null,
    });
    setProblem(null);
    reload();
  }

  async function remove(id: string) {
    try {
      await authedSend('DELETE', `/transactions/${id}`);
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

  const groups = categories.status === 'ready' ? categories.data.groups : [];

  return (
    <section className="mx-auto max-w-md p-6">
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm text-emerald-700 underline">
          ← Back
        </Link>
        <Link to="/expenses/new" className="text-sm text-emerald-700 underline">
          Add expense
        </Link>
      </div>
      <h1 className="mt-3 text-2xl font-semibold">Expenses</h1>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => goTo(shiftMonth(month, -1))}
          disabled={editing}
          className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-40"
        >
          ◀
        </button>
        <h2 aria-live="polite" className="text-lg font-medium">
          {formatMonth(month)}
        </h2>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => goTo(shiftMonth(month, 1))}
          disabled={editing || month >= thisMonth}
          className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-40"
        >
          ▶
        </button>
      </div>

      <div className="mt-4">
        <label htmlFor="filter" className="text-sm font-medium text-gray-700">
          Filter by category
        </label>
        <select
          id="filter"
          value={categoryId}
          disabled={editing || categories.status !== 'ready'}
          onChange={(event) => {
            setList({ status: 'loading' });
            setCategoryId(event.target.value);
          }}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
        >
          <option value="">{t('category.allCategories')}</option>
          {groups.map((group) => (
            <optgroup key={group.id} label={label(group.name)}>
              {group.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.archived
                    ? `${label(category.name)} ${t('category.archivedSuffix')}`
                    : label(category.name)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {categories.status === 'error' && (
          <p className="mt-1 text-sm text-red-700">
            Could not load your categories.{' '}
            <button
              type="button"
              className="underline"
              onClick={() => {
                setCategories({ status: 'loading' });
                setCategoriesAttempt((n) => n + 1);
              }}
            >
              Try again
            </button>
          </p>
        )}
      </div>

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
          <p>Could not load your expenses.</p>
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

      {list.status === 'ready' && (
        <>
          <p className="mt-6 text-sm text-gray-500">Total{categoryId ? ' (this category)' : ''}</p>
          <p className="text-xl font-semibold" data-testid="month-total">
            {formatMkd(list.data.totalMkd)}{' '}
            <span className="text-sm font-normal text-gray-500">
              ≈{' '}
              {formatEurCents(
                convertMkdToEur(list.data.totalMkd, lastDayOfMonth(list.data.month)).eurCents,
              )}
            </span>
          </p>

          {list.data.transactions.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">
              No expenses in {formatMonth(list.data.month)}.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col divide-y rounded-lg border">
              {list.data.transactions.map((transaction) => (
                <TransactionItem
                  key={transaction.id}
                  transaction={transaction}
                  groups={groups}
                  locked={editing}
                  onEditing={setEditing}
                  onEdit={(values) => edit(transaction.id, values)}
                  onDelete={() => remove(transaction.id)}
                  onCategoryUnavailable={() => setCategoriesAttempt((n) => n + 1)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
