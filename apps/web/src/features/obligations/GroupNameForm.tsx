import { createObligationGroupSchema, fieldErrors, MAX_GROUP_NAME_LENGTH } from '@nestmint/shared';
import { type FormEvent, useId, useState } from 'react';
import { ApiError } from '../../api/client';

interface GroupNameFormProps {
  initial?: string;
  submitLabel: string;
  /** Called with the checked name. Throw the ApiError to show the server's message. */
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}

/** One box for a group's name, used to add and to rename a group. */
export function GroupNameForm({ initial = '', submitLabel, onSave, onCancel }: GroupNameFormProps) {
  const id = useId();
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const result = createObligationGroupSchema.safeParse({ name });
    if (!result.success) {
      setError(fieldErrors(result.error).name ?? 'Enter a name');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(result.data.name);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? (caught.details.name ?? caught.message)
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-3">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-gray-700">
          Group name
        </label>
        <input
          id={id}
          type="text"
          autoFocus
          value={name}
          maxLength={MAX_GROUP_NAME_LENGTH}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={error ? true : undefined}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
        />
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-lg bg-emerald-700 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg border border-gray-300 px-4 py-2 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
