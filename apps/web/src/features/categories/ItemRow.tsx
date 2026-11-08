import { useState } from 'react';
import { NameForm } from './NameForm';

interface ItemRowProps {
  name: string;
  /** A group's name is shown as a heading. */
  heading?: boolean;
  archived: boolean;
  /** Archived items cannot be changed here, only restored. */
  canRestore: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  busy: boolean;
  /** Extra sentence in the archive confirmation. */
  archiveNote?: string;
  onRename: (name: string) => Promise<boolean>;
  onMove: (direction: -1 | 1) => void;
  onArchive: () => void;
  onRestore: () => void;
}

const small =
  'rounded-lg border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50 disabled:opacity-40';

/** One group or category in edit mode: rename, move, archive or restore. */
export function ItemRow(props: ItemRowProps) {
  const { name, archived, busy } = props;
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (renaming) {
    return (
      <NameForm
        label={`New name for ${name}`}
        submitLabel="Save"
        initial={name}
        busy={busy}
        onSubmit={props.onRename}
        onCancel={() => setRenaming(false)}
      />
    );
  }

  const Name = props.heading ? 'h2' : 'span';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Name
        className={`${props.heading ? 'font-medium' : ''} ${archived ? 'text-gray-400 line-through' : ''} mr-auto`}
      >
        {name}
        {archived && <span className="ml-2 text-xs no-underline">(archived)</span>}
      </Name>

      {archived && props.canRestore && (
        <button
          type="button"
          disabled={busy}
          onClick={props.onRestore}
          aria-label={`Restore ${name}`}
          className={small}
        >
          Restore
        </button>
      )}

      {!archived && !confirming && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => setRenaming(true)}
            aria-label={`Rename ${name}`}
            className={small}
          >
            Rename
          </button>
          <button
            type="button"
            disabled={busy || !props.canMoveUp}
            onClick={() => props.onMove(-1)}
            aria-label={`Move ${name} up`}
            className={small}
          >
            ▲
          </button>
          <button
            type="button"
            disabled={busy || !props.canMoveDown}
            onClick={() => props.onMove(1)}
            aria-label={`Move ${name} down`}
            className={small}
          >
            ▼
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(true)}
            aria-label={`Archive ${name}`}
            className={small}
          >
            Archive
          </button>
        </>
      )}

      {!archived && confirming && (
        <div
          role="group"
          aria-label={`Archive ${name}?`}
          className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-2 text-sm"
        >
          <span className="mr-auto">
            Archive “{name}”? {props.archiveNote}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setConfirming(false);
              props.onArchive();
            }}
            aria-label={`Confirm archive ${name}`}
            className="rounded-lg bg-amber-700 px-2 py-1 text-white disabled:opacity-50"
          >
            Archive
          </button>
          <button type="button" onClick={() => setConfirming(false)} className={small}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
