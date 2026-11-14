import type { CategoriesResponse, CategoryUsageResponse } from '@nestmint/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../../api/client';
import { useAuth } from '../auth/AuthContext';
import type { CategoryActions, ItemKind } from './categoryActions';
import { GroupCard } from './GroupCard';
import { NameForm } from './NameForm';
import { useT } from '../../i18n/translate';

type Load =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: CategoriesResponse };

const itemPath = (kind: ItemKind, id: string) =>
  kind === 'group' ? `/categories/groups/${id}` : `/categories/${id}`;

/** The ids with the item at `index` swapped with its neighbour. */
function swapped(ids: string[], id: string, direction: -1 | 1): string[] | null {
  const index = ids.indexOf(id);
  const other = index + direction;
  if (index < 0 || other < 0 || other >= ids.length) return null;
  const next = [...ids];
  [next[index], next[other]] = [next[other]!, next[index]!];
  return next;
}

export function CategoriesPage() {
  const { authedGet, authedSend } = useAuth();
  const { category: label } = useT();
  const [editing, setEditing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [addingGroup, setAddingGroup] = useState(false);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const includeArchived = editing && showArchived;

  useEffect(() => {
    let active = true;
    authedGet<CategoriesResponse>(
      includeArchived ? '/categories?includeArchived=true' : '/categories',
    )
      .then((data) => active && setLoad({ status: 'ready', data }))
      .catch(() => active && setLoad({ status: 'error' }));
    return () => {
      active = false;
    };
  }, [authedGet, includeArchived, attempt]);

  /** Runs a change, shows its error, and reloads the list when it worked or the list was out of date. */
  async function run(change: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setProblem(null);
    try {
      await change();
      setAttempt((n) => n + 1);
      return true;
    } catch (error) {
      setProblem(
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      );
      if (error instanceof ApiError && error.code === 'CONFLICT') setAttempt((n) => n + 1);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const groups = load.status === 'ready' ? load.data.groups : [];
  const activeGroupIds = groups.filter((g) => !g.archived).map((g) => g.id);

  const actions: CategoryActions = {
    busy,
    groups,
    addGroup: (name) => run(() => authedSend('POST', '/categories/groups', { name })),
    addCategory: (groupId, name) => run(() => authedSend('POST', '/categories', { groupId, name })),
    rename: (kind, id, name) => run(() => authedSend('PATCH', itemPath(kind, id), { name })),
    setArchived: (kind, id, archived) =>
      run(() => authedSend('PATCH', itemPath(kind, id), { archived })),
    moveToGroup: (categoryId, groupId) =>
      run(() => authedSend('PATCH', `/categories/${categoryId}`, { groupId })),
    usage: async (categoryId) => {
      setProblem(null);
      try {
        return await authedGet<CategoryUsageResponse>(`/categories/${categoryId}/usage`);
      } catch (error) {
        setProblem(
          error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
        );
        return null;
      }
    },
    merge: (sourceId, targetId) =>
      run(() =>
        authedSend('POST', `/categories/${sourceId}/merge`, { targetCategoryId: targetId }),
      ),
    moveGroup: async (id, direction) => {
      const ids = swapped(activeGroupIds, id, direction);
      return ids ? run(() => authedSend('PUT', '/categories/groups/order', { ids })) : false;
    },
    moveCategory: async (groupId, id, direction) => {
      const group = groups.find((g) => g.id === groupId);
      const current = (group?.categories ?? []).filter((c) => !c.archived).map((c) => c.id);
      const ids = swapped(current, id, direction);
      return ids
        ? run(() => authedSend('PUT', `/categories/groups/${groupId}/order`, { ids }))
        : false;
    },
  };

  return (
    <section className="mx-auto max-w-md p-6">
      <Link to="/" className="text-sm text-emerald-700 underline">
        ← Back
      </Link>
      <div className="mt-3 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Categories</h1>
        {load.status === 'ready' && (
          <button
            type="button"
            onClick={() => {
              setEditing((value) => !value);
              setProblem(null);
              setAddingGroup(false);
            }}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </div>

      {load.status === 'loading' && (
        <p className="mt-6 text-gray-500" role="status">
          Loading categories…
        </p>
      )}

      {load.status === 'error' && (
        <div role="alert" className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          <p>Could not load your categories.</p>
          <button
            type="button"
            onClick={() => {
              setLoad({ status: 'loading' });
              setAttempt((n) => n + 1);
            }}
            className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      )}

      {load.status === 'ready' && editing && (
        <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          Show archived
        </label>
      )}

      {problem && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {problem}
        </p>
      )}

      {load.status === 'ready' && !editing && (
        <ul className="mt-6 flex flex-col gap-4">
          {groups.map((group) => (
            <li key={group.id} className="rounded-lg border p-4">
              <h2 className="font-medium">{label(group.name)}</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {group.categories.map((category) => (
                  <li
                    key={category.id}
                    className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
                  >
                    {label(category.name)}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {load.status === 'ready' && editing && (
        <>
          <ul className="mt-4 flex flex-col gap-4">
            {groups.map((group) => {
              const index = activeGroupIds.indexOf(group.id);
              return (
                <GroupCard
                  key={group.id}
                  group={group}
                  position={index >= 0 ? { index, count: activeGroupIds.length } : null}
                  actions={actions}
                />
              );
            })}
          </ul>
          <div className="mt-4">
            {addingGroup ? (
              <NameForm
                label="New group name"
                submitLabel="Add"
                busy={busy}
                onSubmit={actions.addGroup}
                onCancel={() => setAddingGroup(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setAddingGroup(true)}
                className="text-sm text-emerald-700 underline"
              >
                + Add group
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
