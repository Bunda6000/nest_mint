import type { ChangeView, Tone } from './kpi';

const toneClass: Record<Tone, string> = {
  good: 'text-emerald-700',
  bad: 'text-red-700',
  neutral: 'text-gray-500',
};

interface KpiCardProps {
  label: string;
  value: string;
  /** Left out when there is nothing to compare with. */
  change?: ChangeView;
}

/** One number of the dashboard with, when known, how it moved since the month before. */
export function KpiCard({ label, value, change }: KpiCardProps) {
  return (
    <div role="group" aria-label={label} className="rounded-lg border p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {change && (
        <p
          data-testid="change"
          data-tone={change.tone}
          className={`text-sm ${toneClass[change.tone]}`}
        >
          {change.direction !== 'none' && (
            <span aria-hidden="true">{change.direction === 'up' ? '▲' : '▼'} </span>
          )}
          <span className="sr-only">
            {change.direction === 'up' ? 'Up ' : change.direction === 'down' ? 'Down ' : ''}
          </span>
          {change.text}
        </p>
      )}
    </div>
  );
}
