import type { CategoryGroupResponse, CategoryResponse } from '@nestmint/shared';
import { useState } from 'react';
import type { CategoryActions } from './categoryActions';

interface Props {
  category: CategoryResponse;
  actions: CategoryActions;
}

const small =
  'rounded-lg border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50 disabled:opacity-40';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Move a category to another group, or merge it into another category (NM-38, NM-39). */
export function CategoryRelocate({ category, actions }: Props) {
  const [mode, setMode] = useState<'move' | 'merge' | null>(null);
  const [choice, setChoice] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);

  const groups: CategoryGroupResponse[] = actions.groups.filter((g) => !g.archived);
  const moveTargets = groups.filter((g) => g.id !== category.groupId);
  const mergeTargets = groups.flatMap((g) =>
    g.categories
      .filter((c) => !c.archived && c.id !== category.id)
      .map((c) => ({ ...c, group: g })),
  );

  function close() {
    setMode(null);
    setChoice('');
    setConfirm(null);
  }

  if (mode === null) {
    return (
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          disabled={actions.busy || moveTargets.length === 0}
          onClick={() => setMode('move')}
          aria-label={`Move ${category.name} to another group`}
          className={small}
        >
          Move to group…
        </button>
        <button
          type="button"
          disabled={actions.busy || mergeTargets.length === 0}
          onClick={() => setMode('merge')}
          aria-label={`Merge ${category.name} into another category`}
          className={small}
        >
          Merge into…
        </button>
      </div>
    );
  }

  const options =
    mode === 'move'
      ? moveTargets.map((g) => ({ id: g.id, label: g.name }))
      : mergeTargets.map((c) => ({ id: c.id, label: `${c.group.name} › ${c.name}` }));

  return (
    <div
      role="group"
      aria-label={mode === 'move' ? `Move ${category.name}` : `Merge ${category.name}`}
      className="mt-1 flex w-full flex-wrap items-center gap-2 rounded-lg bg-gray-50 p-2 text-sm"
    >
      {confirm === null ? (
        <>
          <select
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
            aria-label={mode === 'move' ? 'Target group' : 'Category to merge into'}
            className="rounded-lg border border-gray-300 px-2 py-1"
          >
            <option value="">Choose…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={actions.busy || choice === ''}
            className={small}
            onClick={async () => {
              if (mode === 'move') {
                if (await actions.moveToGroup(category.id, choice)) close();
                return;
              }
              const usage = await actions.usage(category.id);
              const target = options.find((o) => o.id === choice)?.label ?? '';
              if (usage) {
                setConfirm(
                  `${plural(usage.transactions, 'expense', 'expenses')} and ${plural(usage.obligations, 'bill', 'bills')} will move to “${target}”, and “${category.name}” will be archived.`,
                );
              }
            }}
          >
            {mode === 'move' ? 'Move' : 'Continue'}
          </button>
        </>
      ) : (
        <>
          <span className="mr-auto">{confirm}</span>
          <button
            type="button"
            disabled={actions.busy}
            aria-label={`Confirm merge ${category.name}`}
            className="rounded-lg bg-amber-700 px-2 py-1 text-white disabled:opacity-50"
            onClick={async () => {
              if (await actions.merge(category.id, choice)) close();
            }}
          >
            Merge
          </button>
        </>
      )}
      <button type="button" onClick={close} className={small}>
        Cancel
      </button>
    </div>
  );
}
