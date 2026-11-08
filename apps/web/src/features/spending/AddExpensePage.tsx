import { convertMkdToEur } from '@nestmint/finance-engine';
import {
  type CategoriesResponse,
  createExpenseSchema,
  fieldErrors,
  MAX_NOTE_LENGTH,
  type TransactionResponse,
  type TransactionsResponse,
} from '@nestmint/shared';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../../api/client';
import { formatEurCents, formatMkd, localDay } from '../../format';
import { useAuth } from '../auth/AuthContext';
import { parseAmount } from './amount';
import { CategoryPicker } from './CategoryPicker';
import { RecentExpenses } from './RecentExpenses';

type Load<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

const RECENT = 10;

export function AddExpensePage() {
  const { authedGet, authedSend } = useAuth();
  const [categories, setCategories] = useState<Load<CategoriesResponse>>({ status: 'loading' });
  const [recent, setRecent] = useState<Load<TransactionsResponse>>({ status: 'loading' });
  const [categoriesAttempt, setCategoriesAttempt] = useState(0);
  const [recentAttempt, setRecentAttempt] = useState(0);

  const [amountText, setAmountText] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [day, setDay] = useState(() => localDay());
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<TransactionResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const amountInput = useRef<HTMLInputElement>(null);

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

  const parsed = parseAmount(amountText);

  /** A live euro estimate under the amount; nothing while the amount or date is not usable. */
  const eurPreview = useMemo(() => {
    if (parsed.status !== 'ok' || parsed.value < 1) return null;
    try {
      return formatEurCents(convertMkdToEur(parsed.value, day).eurCents);
    } catch {
      return null;
    }
  }, [parsed, day]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaved(null);
    setProblem(null);

    const found: Record<string, string> = {};
    const result = createExpenseSchema.safeParse({
      categoryId,
      amountMkd: parsed.status === 'ok' ? parsed.value : undefined,
      occurredOn: day,
      note,
    });
    if (!result.success) Object.assign(found, fieldErrors(result.error));
    // The box holds text, so a typo like "12.5" needs its own, clearer message than "Enter an amount".
    if (parsed.status === 'invalid') found.amountMkd = parsed.message;
    if (!result.success || parsed.status === 'invalid') {
      setErrors(found);
      return;
    }
    setErrors({});

    setSaving(true);
    try {
      const expense = await authedSend<TransactionResponse>('POST', '/transactions', {
        categoryId,
        amountMkd: result.data.amountMkd,
        occurredOn: result.data.occurredOn,
        ...(result.data.note ? { note: result.data.note } : {}),
      });
      setSaved(expense);
      setAmountText('');
      setNote('');
      setRecentAttempt((n) => n + 1);
      amountInput.current?.focus();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.details);
        setProblem(error.message);
        // The category may have been archived or removed on another device: show the current list.
        if (error.code === 'CONFLICT' || error.code === 'NOT_FOUND') {
          setCategoryId('');
          setCategoriesAttempt((n) => n + 1);
        }
      } else {
        setProblem('Something went wrong. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto max-w-md p-6">
      <Link to="/" className="text-sm text-emerald-700 underline">
        ← Back
      </Link>
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
        <form
          onSubmit={(event) => void handleSubmit(event)}
          noValidate
          className="mt-6 flex flex-col gap-5"
        >
          <div>
            <label htmlFor="amount" className="text-sm font-medium text-gray-700">
              Amount (MKD)
            </label>
            <input
              id="amount"
              ref={amountInput}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
              aria-invalid={errors.amountMkd ? true : undefined}
              aria-describedby="amount-hint"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-lg"
            />
            <p id="amount-hint" aria-live="polite" className="mt-1 min-h-5 text-sm text-gray-500">
              {eurPreview ? `≈ ${eurPreview}` : ''}
            </p>
            {errors.amountMkd && (
              <p role="alert" className="text-sm text-red-700">
                {errors.amountMkd}
              </p>
            )}
          </div>

          <CategoryPicker
            groups={categories.data.groups}
            value={categoryId}
            onChange={setCategoryId}
            error={errors.categoryId}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="day" className="text-sm font-medium text-gray-700">
                Date
              </label>
              <input
                id="day"
                type="date"
                value={day}
                onChange={(event) => setDay(event.target.value)}
                aria-invalid={errors.occurredOn ? true : undefined}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              />
              {errors.occurredOn && (
                <p role="alert" className="text-sm text-red-700">
                  {errors.occurredOn}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="note" className="text-sm font-medium text-gray-700">
                Note (optional)
              </label>
              <input
                id="note"
                type="text"
                value={note}
                maxLength={MAX_NOTE_LENGTH}
                onChange={(event) => setNote(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              />
              {errors.note && (
                <p role="alert" className="text-sm text-red-700">
                  {errors.note}
                </p>
              )}
            </div>
          </div>

          {problem && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {problem}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-emerald-700 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save expense'}
          </button>

          {saved && (
            <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              Saved: {formatMkd(saved.amountMkd)} · {saved.categoryName}
            </p>
          )}
        </form>
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
