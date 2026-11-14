import { convertMkdToEur } from '@nestmint/finance-engine';
import type {
  CategoryGroupResponse,
  CreateLoanData,
  CreateObligationData,
  CreateRateChangeData,
  ObligationResponse,
} from '@nestmint/shared';
import { useState } from 'react';
import { formatEurCents, formatMkd, localDay } from '../../format';
import { LoanForm } from './LoanForm';
import { currentLoanTerms, describeLoan, describeRateChange } from './loanText';
import { ObligationForm } from './ObligationForm';
import { describeObligation } from './obligationText';
import { RateChangeForm } from './RateChangeForm';

interface ObligationItemProps {
  obligation: ObligationResponse;
  groups: CategoryGroupResponse[];
  /** Something else is being added or edited. */
  locked: boolean;
  onEdit: (values: CreateObligationData) => Promise<void>;
  onEditLoan: (values: CreateLoanData) => Promise<void>;
  onRateChange: (values: CreateRateChangeData) => Promise<void>;
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
  onEditLoan,
  onRateChange,
  onEditing,
}: ObligationItemProps) {
  const [mode, setMode] = useState<'view' | 'edit' | 'rate'>('view');
  const editing = mode === 'edit';
  const isLoan = obligation.kind === 'loan' && obligation.loan !== null;

  const stop = () => {
    setMode('view');
    onEditing(false);
  };
  const start = (next: 'edit' | 'rate') => {
    setMode(next);
    onEditing(true);
  };

  if (editing && isLoan) {
    return (
      <li className="p-3">
        <p className="mb-3 font-medium">Edit loan</p>
        <LoanForm
          groups={groups}
          initial={obligation}
          onSave={async (values) => {
            await onEditLoan(values);
            stop();
          }}
          onCancel={stop}
        />
      </li>
    );
  }

  if (mode === 'rate' && isLoan) {
    return (
      <li className="p-3">
        <p className="mb-3 font-medium">Rate change for {obligation.name}</p>
        <RateChangeForm
          loan={obligation}
          onSave={async (values) => {
            await onRateChange(values);
            stop();
          }}
          onCancel={stop}
        />
      </li>
    );
  }

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
            stop();
          }}
          onCancel={stop}
        />
      </li>
    );
  }

  const today = localDay();
  // A loan shows the payment in force now, which a rate change may have moved.
  const payment = isLoan
    ? currentLoanTerms(obligation, today.slice(0, 7)).monthlyPaymentMkd
    : obligation.expectedAmountMkd;
  const euro = convertMkdToEur(payment, today).eurCents;
  const label = `${obligation.name}, ${formatMkd(payment)}`;

  return (
    <li className="p-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium">{obligation.name}</p>
          <p className="text-xs text-gray-500">
            {[obligation.payee, obligation.categoryName].filter(Boolean).join(' · ')}
          </p>
          {obligation.kind === 'loan' && obligation.loan && (
            <p className="text-xs text-gray-500">{describeLoan(obligation.loan)}</p>
          )}
          {obligation.loan?.rateChanges.map((change) => (
            <p key={change.effectiveMonth} className="text-xs text-gray-500">
              {describeRateChange(change)}
            </p>
          ))}
          <p className="text-xs text-gray-500">{describeObligation(obligation)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-medium">{formatMkd(payment)}</p>
          <p className="text-xs text-gray-500">{formatEurCents(euro)}</p>
        </div>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        {isLoan && (
          <button
            type="button"
            disabled={locked}
            aria-label={`Rate change for ${label}`}
            onClick={() => start('rate')}
            className={small}
          >
            Rate change
          </button>
        )}
        <button
          type="button"
          disabled={locked}
          aria-label={`Edit ${label}`}
          onClick={() => start('edit')}
          className={small}
        >
          Edit
        </button>
      </div>
    </li>
  );
}
