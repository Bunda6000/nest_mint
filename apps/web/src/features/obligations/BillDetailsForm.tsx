import { MAX_INVOICE_REF_LENGTH, updateBillSchema } from '@nestmint/shared';
import { type FormEvent, useId, useState } from 'react';
import { ApiError } from '../../api/client';
import { formatMkd } from '../../format';
import { parseAmount } from '../spending/amount';

export interface BillDetailsValues {
  /** `null` takes the actual amount away again. */
  actualAmountMkd: number | null;
  /** `null` clears the invoice reference. */
  invoiceRef: string | null;
}

interface BillDetailsFormProps {
  expectedAmountMkd: number;
  actualAmountMkd: number | null;
  invoiceRef: string | null;
  /** Called with checked values. Throw the ApiError to show the server's message in the form. */
  onSave: (values: BillDetailsValues) => Promise<void>;
  onCancel: () => void;
}

/** Enter what the invoice says: the actual amount and the invoice reference, before paying. */
export function BillDetailsForm(props: BillDetailsFormProps) {
  const id = useId();
  const [amountText, setAmountText] = useState(
    props.actualAmountMkd === null ? '' : String(props.actualAmountMkd),
  );
  const [ref, setRef] = useState(props.invoiceRef ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setProblem(null);

    const parsed = parseAmount(amountText);
    if (parsed.status === 'invalid') {
      setErrors({ actualAmountMkd: parsed.message });
      return;
    }
    // An empty amount box means "no actual amount": back to the expected amount.
    const result = updateBillSchema.safeParse({
      actualAmountMkd: parsed.status === 'ok' ? parsed.value : null,
      invoiceRef: ref,
    });
    if (!result.success) {
      const found: Record<string, string> = {};
      for (const issue of result.error.issues)
        found[String(issue.path[0] ?? 'form')] ??= issue.message;
      setErrors(found);
      return;
    }
    setErrors({});

    setSaving(true);
    try {
      await props.onSave({
        actualAmountMkd: result.data.actualAmountMkd ?? null,
        invoiceRef: result.data.invoiceRef ?? null,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.details);
        setProblem(error.message);
      } else {
        setProblem('Something went wrong. Please try again.');
      }
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
      className="mt-3 flex flex-col gap-3"
    >
      <div>
        <label htmlFor={`${id}-actual`} className="text-sm font-medium text-gray-700">
          Actual amount (MKD)
        </label>
        <input
          id={`${id}-actual`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={amountText}
          onChange={(event) => setAmountText(event.target.value)}
          aria-invalid={errors.actualAmountMkd ? true : undefined}
          aria-describedby={`${id}-hint`}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
        />
        <p id={`${id}-hint`} className="mt-1 text-sm text-gray-500">
          Expected {formatMkd(props.expectedAmountMkd)}. Leave empty to use the expected amount.
        </p>
        {errors.actualAmountMkd && (
          <p role="alert" className="text-sm text-red-700">
            {errors.actualAmountMkd}
          </p>
        )}
      </div>
      <div>
        <label htmlFor={`${id}-ref`} className="text-sm font-medium text-gray-700">
          Invoice reference (optional)
        </label>
        <input
          id={`${id}-ref`}
          type="text"
          value={ref}
          maxLength={MAX_INVOICE_REF_LENGTH}
          onChange={(event) => setRef(event.target.value)}
          aria-invalid={errors.invoiceRef ? true : undefined}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
        />
        {errors.invoiceRef && (
          <p role="alert" className="text-sm text-red-700">
            {errors.invoiceRef}
          </p>
        )}
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
          className="flex-1 rounded-lg bg-emerald-700 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save details'}
        </button>
        <button
          type="button"
          onClick={props.onCancel}
          disabled={saving}
          className="rounded-lg border border-gray-300 px-4 py-2 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
