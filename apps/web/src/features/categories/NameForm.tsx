import { MAX_CATEGORY_NAME_LENGTH } from '@nestmint/shared';
import { type FormEvent, useState } from 'react';

interface NameFormProps {
  /** Accessible name of the input, e.g. "New category name". */
  label: string;
  submitLabel: string;
  initial?: string;
  busy: boolean;
  /** Resolves true when saved. The form then closes. */
  onSubmit: (name: string) => Promise<boolean>;
  onCancel: () => void;
}

export function NameForm({
  label,
  submitLabel,
  initial = '',
  busy,
  onSubmit,
  onCancel,
}: NameFormProps) {
  const [name, setName] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setProblem('Enter a name');
      return;
    }
    setProblem(null);
    if (await onSubmit(trimmed)) onCancel();
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input
          aria-label={label}
          value={name}
          maxLength={MAX_CATEGORY_NAME_LENGTH}
          onChange={(event) => setName(event.target.value)}
          autoFocus
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        >
          Cancel
        </button>
      </div>
      {problem && (
        <p role="alert" className="text-sm text-red-700">
          {problem}
        </p>
      )}
    </form>
  );
}
