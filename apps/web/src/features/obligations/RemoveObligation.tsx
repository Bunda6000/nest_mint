import { useState } from 'react';
import { ApiError } from '../../api/client';

interface RemoveObligationProps {
  name: string;
  /** Deletes for good. Throws the ApiError (409, details.paidBills) when it has payments. */
  onDelete: () => Promise<void>;
  /** Hides it and keeps what was paid. */
  onArchive: () => Promise<void>;
  onCancel: () => void;
}

const button = 'rounded-lg border px-3 py-2 text-sm disabled:opacity-50';

/**
 * Delete, as far as it can go. With no payments it is deleted. With payments the app says how many
 * and offers to archive instead, which keeps them in the history and the totals.
 */
export function RemoveObligation({ name, onDelete, onArchive, onCancel }: RemoveObligationProps) {
  const [paidBills, setPaidBills] = useState<number | null>(null);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function run(action: () => Promise<void>, onConflict?: (count: number) => void) {
    if (working) return;
    setWorking(true);
    setProblem(null);
    try {
      await action();
    } catch (error) {
      const count = error instanceof ApiError ? Number(error.details.paidBills) : NaN;
      if (error instanceof ApiError && error.status === 409 && count > 0 && onConflict) {
        onConflict(count);
      } else {
        setProblem('Something went wrong. Please try again.');
      }
      setWorking(false);
    }
  }

  return (
    <div role="alertdialog" aria-label={`Remove ${name}`} className="mt-2 rounded-lg bg-red-50 p-3">
      {paidBills === null ? (
        <>
          <p className="text-sm text-red-800">
            Delete {name}? Its unpaid bills are removed too. This cannot be undone.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={working}
              onClick={() => void run(onDelete, setPaidBills)}
              className={`${button} border-red-600 bg-red-600 text-white`}
            >
              {working ? 'Deleting…' : `Delete ${name}`}
            </button>
            <button type="button" disabled={working} onClick={onCancel} className={button}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-red-800">
            {name} has {paidBills} recorded {paidBills === 1 ? 'payment' : 'payments'}, so it cannot
            be deleted. Archive it instead: the payments stay in your history and totals, its unpaid
            bills are removed, and no new bills are made.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={working}
              onClick={() => void run(onArchive)}
              className={`${button} border-red-600 bg-red-600 text-white`}
            >
              {working ? 'Archiving…' : `Archive ${name}`}
            </button>
            <button type="button" disabled={working} onClick={onCancel} className={button}>
              Cancel
            </button>
          </div>
        </>
      )}
      {problem && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {problem}
        </p>
      )}
    </div>
  );
}
