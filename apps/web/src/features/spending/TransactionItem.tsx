import { convertMkdToEur } from '@nestmint/finance-engine';
import type { CategoryGroupResponse, TransactionResponse } from '@nestmint/shared';
import { useState } from 'react';
import { formatDay, formatEurCents, formatMkd } from '../../format';
import { groupsForEdit } from './editGroups';
import { ExpenseForm, type ExpenseValues } from './ExpenseForm';
import { useT } from '../../i18n/translate';

interface TransactionItemProps {
  transaction: TransactionResponse;
  groups: CategoryGroupResponse[];
  /** Another row is being edited, or a change is in progress. */
  locked: boolean;
  onEdit: (values: ExpenseValues) => Promise<void>;
  onDelete: () => Promise<void>;
  onCategoryUnavailable: () => void;
  /** Called when this row starts or stops being edited. */
  onEditing: (editing: boolean) => void;
}

const small =
  'rounded-lg border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50 disabled:opacity-40';

/** One transaction in the list: view, edit in place, or delete after a confirmation. */
export function TransactionItem(props: TransactionItemProps) {
  const { transaction: t, locked } = props;
  const { category: label } = useT();
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm'>('view');
  const [deleting, setDeleting] = useState(false);

  if (mode === 'edit') {
    return (
      <li className="p-3">
        <p className="mb-3 font-medium">Edit expense</p>
        <ExpenseForm
          groups={groupsForEdit(props.groups, t.categoryId)}
          initial={{
            amountMkd: t.amountMkd,
            categoryId: t.categoryId,
            occurredOn: t.occurredOn,
            note: t.note,
          }}
          submitLabel="Save changes"
          onSave={async (values) => {
            await props.onEdit(values);
            setMode('view');
            props.onEditing(false);
          }}
          onCategoryUnavailable={props.onCategoryUnavailable}
          onCancel={() => {
            setMode('view');
            props.onEditing(false);
          }}
        />
      </li>
    );
  }

  const summary = `${label(t.categoryName)}, ${formatMkd(t.amountMkd)}, ${formatDay(t.occurredOn)}`;

  return (
    <li className="p-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium">{label(t.categoryName)}</p>
          {t.kind === 'cash_withdrawal' && (
            <p className="text-xs font-medium text-emerald-700">Cash withdrawal</p>
          )}
          {t.note && <p className="truncate text-sm text-gray-600">{t.note}</p>}
          <p className="text-xs text-gray-500">{formatDay(t.occurredOn)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-medium">{formatMkd(t.amountMkd)}</p>
          <p className="text-xs text-gray-500">
            {formatEurCents(convertMkdToEur(t.amountMkd, t.occurredOn).eurCents)}
          </p>
        </div>
      </div>

      {mode === 'confirm' ? (
        <div
          role="alertdialog"
          aria-label={`Delete ${summary}?`}
          className="mt-3 rounded-lg bg-red-50 p-3 text-sm"
        >
          <p className="text-red-800">Delete this expense? This cannot be undone.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={() => {
                setDeleting(true);
                void props.onDelete().finally(() => {
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
            aria-label={`Edit ${summary}`}
            onClick={() => {
              setMode('edit');
              props.onEditing(true);
            }}
            className={small}
          >
            Edit
          </button>
          <button
            type="button"
            disabled={locked}
            aria-label={`Delete ${summary}`}
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
