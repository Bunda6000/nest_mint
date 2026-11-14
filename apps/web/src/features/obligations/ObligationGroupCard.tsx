import type {
  CategoryGroupResponse,
  CreateObligationData,
  ObligationGroupResponse,
  ObligationResponse,
} from '@nestmint/shared';
import { type ReactNode, useState } from 'react';
import { ApiError } from '../../api/client';
import { formatMkd } from '../../format';
import { GroupNameForm } from './GroupNameForm';
import { ObligationForm } from './ObligationForm';

interface ObligationGroupCardProps {
  group: ObligationGroupResponse;
  lines: ObligationResponse[];
  categoryGroups: CategoryGroupResponse[];
  /** Something else is being added or edited. */
  locked: boolean;
  onBusy: (busy: boolean) => void;
  onAddLine: (values: CreateObligationData) => Promise<void>;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  /** The lines, as list items. */
  children: ReactNode;
}

const small = 'rounded-lg border border-gray-300 px-2.5 py-1 text-xs disabled:opacity-50';

/** A group of obligations (Streaming: Netflix, Disney) with its lines and what they cost a month. */
export function ObligationGroupCard({
  group,
  lines,
  categoryGroups,
  locked,
  onBusy,
  onAddLine,
  onRename,
  onDelete,
  children,
}: ObligationGroupCardProps) {
  const [mode, setMode] = useState<'view' | 'line' | 'rename'>('view');
  const [problem, setProblem] = useState<string | null>(null);

  const monthly = lines
    .filter((l) => l.recurrence === 'monthly')
    .reduce((sum, l) => sum + l.expectedAmountMkd, 0);

  const start = (next: 'line' | 'rename') => {
    setProblem(null);
    setMode(next);
    onBusy(true);
  };
  const stop = () => {
    setMode('view');
    onBusy(false);
  };

  async function handleDelete() {
    setProblem(null);
    try {
      await onDelete();
    } catch (error) {
      setProblem(error instanceof ApiError ? error.message : 'Could not delete the group.');
    }
  }

  return (
    <section aria-label={`Group ${group.name}`} className="mt-4 rounded-lg border">
      <div className="flex items-start justify-between gap-3 border-b bg-gray-50 p-3">
        <div className="min-w-0">
          <h2 className="font-medium">{group.name}</h2>
          <p className="text-xs text-gray-500">
            {lines.length === 1 ? '1 line' : `${lines.length} lines`}
            {monthly > 0 ? ` · every month ${formatMkd(monthly)}` : ''}
          </p>
        </div>
        {mode === 'view' && (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              disabled={locked}
              aria-label={`Add a line to ${group.name}`}
              onClick={() => start('line')}
              className={small}
            >
              Add a line
            </button>
            <button
              type="button"
              disabled={locked}
              aria-label={`Rename ${group.name}`}
              onClick={() => start('rename')}
              className={small}
            >
              Rename
            </button>
            {lines.length === 0 && (
              <button
                type="button"
                disabled={locked}
                aria-label={`Delete group ${group.name}`}
                onClick={() => void handleDelete()}
                className={small}
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
      {problem && (
        <p role="alert" className="p-3 text-sm text-red-700">
          {problem}
        </p>
      )}
      {mode === 'rename' && (
        <div className="border-b p-3">
          <GroupNameForm
            initial={group.name}
            submitLabel="Save name"
            onSave={async (name) => {
              await onRename(name);
              stop();
            }}
            onCancel={stop}
          />
        </div>
      )}
      {mode === 'line' && (
        <div className="border-b p-3">
          <p className="mb-3 font-medium">Add a line to {group.name}</p>
          <ObligationForm
            groups={categoryGroups}
            submitLabel="Save line"
            onSave={async (values) => {
              await onAddLine(values);
              stop();
            }}
            onCancel={stop}
          />
        </div>
      )}
      {lines.length === 0 ? (
        <p className="p-3 text-sm text-gray-500">No lines yet. Add Netflix, fuel and the like.</p>
      ) : (
        <ul className="flex flex-col divide-y">{children}</ul>
      )}
    </section>
  );
}
