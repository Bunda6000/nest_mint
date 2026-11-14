import type { GoalResponse } from '@nestmint/shared';
import { useState, type FormEvent } from 'react';
import { formatMkd, localDay } from '../../format';
import { goalAdvice, formatMonthYear, STATUS_LABEL, STATUS_TONE } from './goalText';

interface Props {
  goal: GoalResponse;
  busy: boolean;
  onContribute: (goalId: string, amountMkd: number, day: string) => Promise<boolean>;
  onArchive: (goalId: string, archived: boolean) => void;
}

/** One goal: progress, the sentence that explains it, and a small form to add or take out money. */
export function GoalCard({ goal, busy, onContribute, onArchive }: Props) {
  const [amount, setAmount] = useState('');
  const percent = goal.progress === null ? null : Math.round(goal.progress * 100);

  async function submit(event: FormEvent, sign: 1 | -1) {
    event.preventDefault();
    const value = Number(amount.replace(/[ ,]/g, ''));
    if (!Number.isInteger(value) || value <= 0) return;
    if (await onContribute(goal.id, sign * value, localDay())) setAmount('');
  }

  return (
    <li className={`rounded-lg border p-4 ${goal.archived ? 'bg-gray-50' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-medium">{goal.name}</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[goal.status]}`}>
          {STATUS_LABEL[goal.status]}
        </span>
      </div>

      <p className="mt-2 text-sm text-gray-700">
        {formatMkd(goal.savedMkd)}
        {goal.targetMkd !== null && ` of ${formatMkd(goal.targetMkd)}`}
        {goal.targetMonth && ` by ${formatMonthYear(goal.targetMonth)}`}
      </p>

      {percent !== null && (
        <div
          role="progressbar"
          aria-label={`${goal.name} progress`}
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100"
        >
          <div className="h-full bg-emerald-600" style={{ width: `${percent}%` }} />
        </div>
      )}

      <p className="mt-2 text-sm text-gray-600">{goalAdvice(goal, formatMkd)}</p>
      {goal.achievability !== null && goal.status !== 'done' && (
        <p className="mt-1 text-xs text-gray-500">
          Chance of meeting the date: {goal.achievability}% (your pace ÷ the monthly amount needed)
        </p>
      )}

      {!goal.archived && (
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => submit(e, 1)}>
          <label className="text-sm">
            <span className="sr-only">Amount for {goal.name}</span>
            <input
              inputMode="numeric"
              placeholder="Amount, MKD"
              aria-label={`Amount for ${goal.name}`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-36 rounded-lg border border-gray-300 px-3 py-1.5"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            aria-label={`Add money to ${goal.name}`}
            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-60"
          >
            Add
          </button>
          <button
            type="button"
            disabled={busy}
            aria-label={`Take money out of ${goal.name}`}
            onClick={(e) => void submit(e, -1)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-60"
          >
            Take out
          </button>
        </form>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => onArchive(goal.id, !goal.archived)}
        aria-label={`${goal.archived ? 'Restore' : 'Archive'} ${goal.name}`}
        className="mt-3 text-sm text-gray-600 underline"
      >
        {goal.archived ? 'Restore' : 'Archive'}
      </button>
    </li>
  );
}
