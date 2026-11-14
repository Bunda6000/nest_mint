import type { CreateGoalData, GoalKind } from '@nestmint/shared';
import { useState, type FormEvent } from 'react';

interface Props {
  busy: boolean;
  onCreate: (data: CreateGoalData) => Promise<boolean>;
  onCancel: () => void;
}

const num = (value: string): number => Number(value.replace(/[ ,]/g, ''));

/** The form for a new goal; which amounts it asks for depends on the kind. */
export function NewGoalForm({ busy, onCreate, onCancel }: Props) {
  const [kind, setKind] = useState<GoalKind>('target_date');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [month, setMonth] = useState('');
  const [monthly, setMonthly] = useState('');
  const [starting, setStarting] = useState('');
  const [priority, setPriority] = useState<'1' | '2' | '3'>('2');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const common = {
      name,
      priority: Number(priority) as 1 | 2 | 3,
      ...(starting ? { startingMkd: num(starting) } : {}),
    };
    const data: CreateGoalData =
      kind === 'monthly'
        ? { kind, ...common, monthlyMkd: num(monthly) }
        : kind === 'target'
          ? { kind, ...common, targetMkd: num(target) }
          : { kind, ...common, targetMkd: num(target), targetMonth: month };
    await onCreate(data);
  }

  const field = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2';

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-3 rounded-lg border p-4 text-sm">
      <label>
        Kind
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as GoalKind)}
          className={field}
        >
          <option value="target_date">An amount by a date</option>
          <option value="target">An amount, no deadline</option>
          <option value="monthly">A fixed amount every month</option>
        </select>
      </label>
      <label>
        Goal name
        <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
      </label>
      {kind !== 'monthly' && (
        <label>
          Target (MKD)
          <input
            inputMode="numeric"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className={field}
          />
        </label>
      )}
      {kind === 'target_date' && (
        <label>
          Reach it by (month)
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className={field}
          />
        </label>
      )}
      {kind === 'monthly' && (
        <label>
          Every month (MKD)
          <input
            inputMode="numeric"
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
            className={field}
          />
        </label>
      )}
      <label>
        Already saved (MKD, optional)
        <input
          inputMode="numeric"
          value={starting}
          onChange={(e) => setStarting(e.target.value)}
          className={field}
        />
      </label>
      <label>
        Priority
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as '1' | '2' | '3')}
          className={field}
        >
          <option value="1">High</option>
          <option value="2">Normal</option>
          <option value="3">Low</option>
        </select>
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-white disabled:opacity-60"
        >
          Create goal
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border px-4 py-2">
          Cancel
        </button>
      </div>
    </form>
  );
}
