import { monthlySummary } from '@nestmint/finance-engine';
import { formatMkd, formatRate } from './format';

// Placeholder until the dashboard (NM-28). Example: Budget.xlsx, January 2025.
const example = monthlySummary(146_308, 82_272);

export function App() {
  return (
    <main className="mx-auto max-w-md p-6 font-sans">
      <h1 className="text-2xl font-semibold">NestMint</h1>
      <p className="mt-1 text-sm text-gray-500">
        Scaffold is running. Example month: January 2025.
      </p>
      <dl className="mt-6 grid grid-cols-2 gap-4">
        <div className="rounded-lg border p-4">
          <dt className="text-sm text-gray-500">Net savings</dt>
          <dd className="text-lg font-semibold">{formatMkd(example.net)}</dd>
        </div>
        <div className="rounded-lg border p-4">
          <dt className="text-sm text-gray-500">Savings rate</dt>
          <dd className="text-lg font-semibold">{formatRate(example.savingsRate)}</dd>
        </div>
      </dl>
    </main>
  );
}
