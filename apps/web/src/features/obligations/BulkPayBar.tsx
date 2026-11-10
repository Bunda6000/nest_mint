import { MAX_BULK_PAY, isoDateSchema } from '@nestmint/shared';
import { type FormEvent, useId, useState } from 'react';
import { ApiError } from '../../api/client';
import { formatMkd, localDay } from '../../format';

interface BulkPayBarProps {
  count: number;
  /** The bills' amounts added up. */
  totalMkd: number;
  /** Another action is open, so this one waits. */
  disabled: boolean;
  /** Called with the day. Throw the ApiError to show the server's message here. */
  onPay: (paidOn: string) => Promise<void>;
  /** Called when the day box opens or closes, so the rest of the page can wait. */
  onOpen: (open: boolean) => void;
}

/** "3 selected · 12,300 MKD": pay them all on one day, each for its own amount. */
export function BulkPayBar({ count, totalMkd, disabled, onPay, onOpen }: BulkPayBarProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(localDay());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const tooMany = count > MAX_BULK_PAY;

  function toggle(next: boolean) {
    setOpen(next);
    setError(null);
    onOpen(next);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const date = isoDateSchema.safeParse(day);
    if (!date.success) {
      setError(date.error.issues[0]!.message);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onPay(date.data);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Something went wrong. Please try again.',
      );
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm">
          <span className="font-medium">{count} selected</span> · {formatMkd(totalMkd)}
        </p>
        {!open && (
          <button
            type="button"
            disabled={disabled || tooMany}
            onClick={() => toggle(true)}
            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            Mark selected as paid
          </button>
        )}
      </div>
      {tooMany && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          Select at most {MAX_BULK_PAY} bills at once.
        </p>
      )}
      {open && (
        <form
          onSubmit={(event) => void handleSubmit(event)}
          noValidate
          className="mt-3 flex flex-col gap-3"
        >
          <div>
            <label htmlFor={`${id}-day`} className="text-sm font-medium text-gray-700">
              Paid on
            </label>
            <input
              id={`${id}-day`}
              type="date"
              value={day}
              onChange={(event) => setDay(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            />
            <p className="mt-1 text-sm text-gray-600">Each bill is paid for its own amount.</p>
          </div>
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-emerald-700 px-4 py-2 font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : `Pay ${count} ${count === 1 ? 'bill' : 'bills'}`}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => toggle(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
