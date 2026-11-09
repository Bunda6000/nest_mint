import { convertMkdToEur } from '@nestmint/finance-engine';
import type {
  CategoryGroupResponse,
  CreateObligationData,
  ObligationResponse,
} from '@nestmint/shared';
import { useState } from 'react';
import { formatEurCents, formatMkd, localDay } from '../../format';
import { ObligationForm } from './ObligationForm';
import { describeObligation } from './obligationText';

interface ObligationItemProps {
  obligation: ObligationResponse;
  groups: CategoryGroupResponse[];
  /** Something else is being added or edited. */
  locked: boolean;
  onEdit: (values: CreateObligationData) => Promise<void>;
  /** Called when this row starts or stops being edited. */
  onEditing: (editing: boolean) => void;
}

const small =
  'rounded-lg border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50 disabled:opacity-40';

/** One recurring bill in the list: view, or edit in place. */
export function ObligationItem({
  obligation,
  groups,
  locked,
  onEdit,
  onEditing,
}: ObligationItemProps) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="p-3">
        <p className="mb-3 font-medium">Edit bill</p>
        <ObligationForm
          groups={groups}
          initial={obligation}
          submitLabel="Save changes"
          onSave={async (values) => {
            await onEdit(values);
            setEditing(false);
            onEditing(false);
          }}
          onCancel={() => {
            setEditing(false);
            onEditing(false);
          }}
        />
      </li>
    );
  }

  const euro = convertMkdToEur(obligation.expectedAmountMkd, localDay()).eurCents;
  const label = `${obligation.name}, ${formatMkd(obligation.expectedAmountMkd)}`;

  return (
    <li className="p-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium">{obligation.name}</p>
          <p className="text-xs text-gray-500">
            {[obligation.payee, obligation.categoryName].filter(Boolean).join(' · ')}
          </p>
          <p className="text-xs text-gray-500">{describeObligation(obligation)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-medium">{formatMkd(obligation.expectedAmountMkd)}</p>
          <p className="text-xs text-gray-500">{formatEurCents(euro)}</p>
        </div>
      </div>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          disabled={locked}
          aria-label={`Edit ${label}`}
          onClick={() => {
            setEditing(true);
            onEditing(true);
          }}
          className={small}
        >
          Edit
        </button>
      </div>
    </li>
  );
}
