import { monthlySummary } from '@nestmint/finance-engine';
import { Link } from 'react-router';
import { formatMkd, formatRate } from '../../format';
import { useAuth } from '../auth/AuthContext';

// Placeholder until the dashboard (NM-28). Example: Budget.xlsx, January 2025.
const example = monthlySummary(146_308, 82_272);

export function HomePage() {
  const { state, logout } = useAuth();
  const name = state.status === 'authenticated' ? (state.user.displayName ?? state.user.email) : '';

  return (
    <section className="mx-auto max-w-md p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">NestMint</h1>
          <p className="mt-1 text-sm text-gray-500">Hello, {name}.</p>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Log out
        </button>
      </header>
      <p className="mt-6 text-sm text-gray-500">Example month: January 2025.</p>
      <dl className="mt-2 grid grid-cols-2 gap-4">
        <div className="rounded-lg border p-4">
          <dt className="text-sm text-gray-500">Net savings</dt>
          <dd className="text-lg font-semibold">{formatMkd(example.net)}</dd>
        </div>
        <div className="rounded-lg border p-4">
          <dt className="text-sm text-gray-500">Savings rate</dt>
          <dd className="text-lg font-semibold">{formatRate(example.savingsRate)}</dd>
        </div>
      </dl>
      <Link
        to="/expenses/new"
        className="mt-6 block rounded-lg bg-emerald-700 px-4 py-3 text-center font-medium text-white"
      >
        Add expense
      </Link>
      <nav className="mt-4">
        <Link to="/categories" className="text-emerald-700 underline">
          Categories
        </Link>
      </nav>
    </section>
  );
}
