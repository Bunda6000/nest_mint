import type { CategoryGroupResponse } from '@nestmint/shared';
import { useState } from 'react';
import type { CategoryActions } from './categoryActions';
import { ItemRow } from './ItemRow';
import { NameForm } from './NameForm';

interface GroupCardProps {
  group: CategoryGroupResponse;
  /** Active groups, in order: decides which arrows are available. */
  position: { index: number; count: number } | null;
  actions: CategoryActions;
}

/** A group with its categories in edit mode. */
export function GroupCard({ group, position, actions }: GroupCardProps) {
  const [adding, setAdding] = useState(false);
  const active = group.categories.filter((category) => !category.archived);
  const activeCount = active.length;

  return (
    <li className={`rounded-lg border p-4 ${group.archived ? 'bg-gray-50' : ''}`}>
      <ItemRow
        heading
        name={group.name}
        archived={group.archived}
        canRestore
        canMoveUp={position !== null && position.index > 0}
        canMoveDown={position !== null && position.index < position.count - 1}
        busy={actions.busy}
        archiveNote={
          activeCount > 0
            ? `Its ${activeCount} categor${activeCount === 1 ? 'y' : 'ies'} will be archived too.`
            : ''
        }
        onRename={(name) => actions.rename('group', group.id, name)}
        onMove={(direction) => void actions.moveGroup(group.id, direction)}
        onArchive={() => void actions.setArchived('group', group.id, true)}
        onRestore={() => void actions.setArchived('group', group.id, false)}
      />

      <ul className="mt-3 flex flex-col gap-2 border-t pt-3">
        {group.categories.map((category) => {
          const index = active.findIndex((candidate) => candidate.id === category.id);
          return (
            <li key={category.id}>
              <ItemRow
                name={category.name}
                archived={category.archived}
                canRestore={!group.archived}
                canMoveUp={index > 0}
                canMoveDown={index >= 0 && index < activeCount - 1}
                busy={actions.busy}
                onRename={(name) => actions.rename('category', category.id, name)}
                onMove={(direction) => void actions.moveCategory(group.id, category.id, direction)}
                onArchive={() => void actions.setArchived('category', category.id, true)}
                onRestore={() => void actions.setArchived('category', category.id, false)}
              />
            </li>
          );
        })}
      </ul>

      {!group.archived && (
        <div className="mt-3">
          {adding ? (
            <NameForm
              label={`New category in ${group.name}`}
              submitLabel="Add"
              busy={actions.busy}
              onSubmit={(name) => actions.addCategory(group.id, name)}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              aria-label={`Add category to ${group.name}`}
              className="text-sm text-emerald-700 underline"
            >
              + Add category
            </button>
          )}
        </div>
      )}
    </li>
  );
}
