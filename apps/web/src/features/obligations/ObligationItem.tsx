import { convertMkdToEur } from '../../rates';
import type {
  CategoryGroupResponse,
  CreateExtraPaymentData,
  CreateLoanData,
  CreateObligationData,
  CreateRateChangeData,
  PayOffLoanData,
  ObligationResponse,
} from '@nestmint/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { formatEurCents, formatMkd, localDay } from '../../format';
import { describeInstallmentPlan, describeInstallmentProgress } from './installmentText';
import { LoanForm } from './LoanForm';
import { ExtraPaymentForm } from './ExtraPaymentForm';
import {
  currentLoanTerms,
  describeExtraPayment,
  describeLoan,
  describeRateChange,
  estimateStillOwed,
  payoffDay,
} from './loanText';
import { PayOffForm } from './PayOffForm';
import { ObligationForm } from './ObligationForm';
import { describeObligation } from './obligationText';
import { RateChangeForm } from './RateChangeForm';
import { RemoveObligation } from './RemoveObligation';

interface ObligationItemProps {
  obligation: ObligationResponse;
  groups: CategoryGroupResponse[];
  /** Something else is being added or edited. */
  locked: boolean;
  onEdit: (values: CreateObligationData) => Promise<void>;
  onEditLoan: (values: CreateLoanData) => Promise<void>;
  onRateChange: (values: CreateRateChangeData) => Promise<void>;
  onExtraPayment: (values: CreateExtraPaymentData) => Promise<void>;
  onPayOff: (values: PayOffLoanData) => Promise<void>;
  onDelete: () => Promise<void>;
  onArchive: () => Promise<void>;
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
  onExtraPayment,
  onPayOff,
  onDelete,
  onArchive,
  onEditing,
}: ObligationItemProps) {
  const [mode, setMode] = useState<'view' | 'edit' | 'rate' | 'extra' | 'payoff' | 'remove'>(
    'view',
  );
  const editing = mode === 'edit';
  const isLoan = obligation.kind === 'loan' && obligation.loan !== null;

  const stop = () => {
    setMode('view');
    onEditing(false);
  };
  const start = (next: 'edit' | 'rate' | 'extra' | 'payoff' | 'remove') => {
    setMode(next);
    onEditing(true);
  };

  if (mode === 'extra' && isLoan) {
    return (
      <li className="p-3">
        <p className="mb-3 font-medium">Extra payment on {obligation.name}</p>
        <ExtraPaymentForm
          loan={obligation}
          onSave={async (values) => {
            await onExtraPayment(values);
            stop();
          }}
          onCancel={stop}
        />
      </li>
    );
  }

  if (mode === 'payoff' && isLoan) {
    return (
      <li className="p-3">
        <p className="mb-3 font-medium">Pay off {obligation.name}</p>
        <PayOffForm
          loan={obligation}
          onSave={async (values) => {
            await onPayOff(values);
            stop();
          }}
          onCancel={stop}
        />
      </li>
    );
  }

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
  const stillOwed = isLoan ? estimateStillOwed(obligation, today.slice(0, 7)) : null;
  const paidOff = obligation.loan ? payoffDay(obligation.loan) !== null : false;
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
          {obligation.loan?.extraPayments.map((payment) => (
            <p key={payment.id} className="text-xs text-gray-500">
              {describeExtraPayment(payment)}
            </p>
          ))}
          {obligation.installment && (
            <>
              <p className="text-xs text-gray-500">
                {describeInstallmentPlan(obligation.installment)}
              </p>
              <p className="text-xs text-gray-500">
                {describeInstallmentProgress(obligation.installment)}
              </p>
            </>
          )}
          {stillOwed !== null && (
            <p className="text-xs text-gray-500">
              Still owed about {formatMkd(stillOwed)} after this month (estimate)
            </p>
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
        <Link
          to={`/obligations/${obligation.id}/history`}
          aria-label={`History of ${obligation.name}`}
          className={`${small} inline-block`}
        >
          History
        </Link>
        {isLoan && !paidOff && (
          <button
            type="button"
            disabled={locked}
            aria-label={`Extra payment on ${obligation.name}`}
            onClick={() => start('extra')}
            className={small}
          >
            Extra payment
          </button>
        )}
        {isLoan && !paidOff && (
          <button
            type="button"
            disabled={locked}
            aria-label={`Pay off ${obligation.name}`}
            onClick={() => start('payoff')}
            className={small}
          >
            Pay off
          </button>
        )}
        {isLoan && !paidOff && (
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
        {!obligation.installment && (
          <button
            type="button"
            disabled={locked}
            aria-label={`Edit ${label}`}
            onClick={() => start('edit')}
            className={small}
          >
            Edit
          </button>
        )}
        <button
          type="button"
          disabled={locked}
          aria-label={`Delete ${obligation.name}`}
          onClick={() => start('remove')}
          className={small}
        >
          Delete
        </button>
      </div>
      {mode === 'remove' && (
        <RemoveObligation
          name={obligation.name}
          onDelete={async () => {
            await onDelete();
            stop();
          }}
          onArchive={async () => {
            await onArchive();
            stop();
          }}
          onCancel={stop}
        />
      )}
    </li>
  );
}
