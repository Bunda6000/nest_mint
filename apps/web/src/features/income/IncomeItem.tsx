import { convertMkdToEur } from '@nestmint/finance-engine';
import type { CreateIncomeData, IncomeResponse } from '@nestmint/shared';
import { useState } from 'react';
import { formatEurCents, formatMkd, localDay } from '../../format';
import { IncomeForm } from './IncomeForm';
import { describeIncome } from './incomeText';

interface IncomeItemProps {
  income: IncomeResponse;
  /** Something else is being added or edited. */
  locked: boolean;
  onEdit: (values: CreateIncomeData) => Promise<void>;
  onDelete: () => Promise<void>;
  /** Called when this row starts or stops being edited. */
  onEditing: (editing: boolean) => void;
}

const small =
  'rounded-lg border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50 disabled:opacity-40';

/** One income in the list: view, edit in place, or delete after a confirmation. */
export function IncomeItem({ income, locked, onEdit, onDelete, onEditing }: IncomeItemProps) {
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm'>('view');
  const [deleting, setDeleting] = useState(false);

  if (mode === 'edit') {
    return (
      <li className="p-3">
        <p className="mb-3 font-medium">Edit income</p>
        <IncomeForm
          initial={income}
          submitLabel="Save changes"
          onSave={async (values) => {
            await onEdit(values);
            setMode('view');
            onEditing(false);
          }}
          onCancel={() => {
            setMode('view');
            onEditing(false);
          }}
        />
      </li>
    );
  }

  const euro = convertMkdToEur(income.amountMkd, income.receivedOn ?? localDay()).eurCents;
  const label = `${income.name}, ${formatMkd(income.amountMkd)}`;

  return (
    <li className="p-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium">{income.name}</p>
          <p className="text-xs text-gray-500">{describeIncome(income)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-medium">{formatMkd(income.amountMkd)}</p>
          <p className="text-xs text-gray-500">{formatEurCents(euro)}</p>
        </div>
      </div>

      {mode === 'confirm' ? (
        <div
          role="alertdialog"
          aria-label={`Delete ${label}?`}
          className="mt-3 rounded-lg bg-red-50 p-3 text-sm"
        >
          <p className="text-red-800">Delete this income? This cannot be undone.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={() => {
                setDeleting(true);
                void onDelete().finally(() => {
                  setDeleting(false);
                  setMode('view');
                });
              }}
              className="rounded-lg bg-red-700 px-3 py-1.5 text-white disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => setMode('view')}
              className={small}
            >
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            disabled={locked}
            aria-label={`Edit ${label}`}
            onClick={() => {
              setMode('edit');
              onEditing(true);
            }}
            className={small}
          >
            Edit
          </button>
          <button
            type="button"
            disabled={locked}
            aria-label={`Delete ${label}`}
            onClick={() => setMode('confirm')}
            className={small}
          >
            Delete
          </button>
        </div>
      )}
    </li>
  );
}
