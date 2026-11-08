import { convertMkdToEur } from '@nestmint/finance-engine';
import {
  type CategoryGroupResponse,
  createExpenseSchema,
  fieldErrors,
  MAX_NOTE_LENGTH,
} from '@nestmint/shared';
import { type FormEvent, useMemo, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { formatEurCents, localDay } from '../../format';
import { parseAmount } from './amount';
import { CategoryPicker } from './CategoryPicker';

export interface ExpenseValues {
  categoryId: string;
  amountMkd: number;
  occurredOn: string;
  /** Left out when empty. */
  note?: string;
}

export interface ExpenseStart {
  amountMkd: number;
  categoryId: string;
  occurredOn: string;
  note: string | null;
}

interface ExpenseFormProps {
  groups: CategoryGroupResponse[];
  /** Values to start from when editing. An empty form for today when left out. */
  initial?: ExpenseStart;
  submitLabel: string;
  /** Called with checked values. Throw the ApiError to show the server's message in the form. */
  onSave: (values: ExpenseValues) => Promise<void>;
  /** Called at the start of every attempt, valid or not. */
  onAttempt?: () => void;
  /** Called when the server says the category is gone or archived, so the list can be reloaded. */
  onCategoryUnavailable: () => void;
  /** Selects this category, and again whenever it changes ("" selects nothing). */
  preferredCategoryId?: string;
  /** Adding: after a save the amount and note are cleared, the cursor goes back to the amount. */
  clearAfterSave?: boolean;
  onCancel?: () => void;
}

/** The expense fields, with checking and live EUR estimate. Used for adding and for editing. */
export function ExpenseForm(props: ExpenseFormProps) {
  const { groups, initial, preferredCategoryId } = props;
  const [amountText, setAmountText] = useState(initial ? String(initial.amountMkd) : '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? preferredCategoryId ?? '');
  const [seenPreferred, setSeenPreferred] = useState(preferredCategoryId);
  const [day, setDay] = useState(initial?.occurredOn ?? localDay());
  const [note, setNote] = useState(initial?.note ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const amountInput = useRef<HTMLInputElement>(null);

  // Follows the preferred category when it changes (React's "adjust state while rendering" pattern).
  if (preferredCategoryId !== seenPreferred) {
    setSeenPreferred(preferredCategoryId);
    if (preferredCategoryId !== undefined) setCategoryId(preferredCategoryId);
  }

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
    props.onAttempt?.();
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
      await props.onSave({
        categoryId,
        amountMkd: result.data.amountMkd,
        occurredOn: result.data.occurredOn,
        ...(result.data.note ? { note: result.data.note } : {}),
      });
      if (props.clearAfterSave) {
        setAmountText('');
        setNote('');
        amountInput.current?.focus();
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.details);
        setProblem(error.message);
        // The category may have been archived or removed on another device: show the current list.
        if (error.code === 'CONFLICT' || error.code === 'NOT_FOUND') {
          setCategoryId('');
          props.onCategoryUnavailable();
        }
      } else {
        setProblem('Something went wrong. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-5">
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
        groups={groups}
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

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-lg bg-emerald-700 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : props.submitLabel}
        </button>
        {props.onCancel && (
          <button
            type="button"
            onClick={props.onCancel}
            disabled={saving}
            className="rounded-lg border border-gray-300 px-4 py-3 text-base disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
