import type { BudgetImportPreviewResponse, ImportLineResponse } from '@nestmint/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../../api/client';
import { formatMkd } from '../../format';
import { useAuth } from '../auth/AuthContext';
import { currentMonth, shortMonth } from '../spending/months';

function LineTable({ title, lines }: { title: string; lines: ImportLineResponse[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="mt-4">
      <h3 className="font-medium text-gray-900">{title}</h3>
      <ul className="mt-1 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white text-sm">
        {lines.map((line, index) => (
          <li key={`${line.section}-${line.name}-${index}`} className="flex gap-2 p-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-gray-900">{line.name}</span>
              <span className="block text-xs text-gray-500">
                {line.section} ·{' '}
                {Object.keys(line.amountsMkd)
                  .map((m) => shortMonth(m))
                  .join(', ')}
              </span>
            </span>
            <span className="text-right">
              <span className="block tabular-nums">{formatMkd(line.totalMkd)}</span>
              {line.suggestedCategoryName && (
                <span className="block text-xs text-emerald-700">
                  → {line.suggestedCategoryName}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** NM-32: pick Budget.xlsx and see what it contains. Nothing is saved from this screen yet. */
export function ImportPage() {
  const { authedSend } = useAuth();
  const [year, setYear] = useState(String(Number(currentMonth().slice(0, 4))));
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [preview, setPreview] = useState<BudgetImportPreviewResponse | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!file) return setProblem('Choose the .xlsx file to import');
    setBusy(true);
    setProblem(null);
    setPreview(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('year', year);
      setPreview(
        await authedSend<BudgetImportPreviewResponse>('POST', '/imports/budget/preview', form),
      );
    } catch (error) {
      setProblem(
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-2xl p-4">
      <Link to="/" className="text-emerald-700 underline">
        ← Home
      </Link>
      <h1 className="mt-2 text-xl font-semibold text-gray-900">Import from Budget.xlsx</h1>
      <p className="mt-1 text-sm text-gray-600">
        Reads the “Буџет” sheet and shows what it contains. Nothing is saved yet.
      </p>

      <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
        <label className="block text-sm">
          <span className="text-gray-700">Workbook (.xlsx)</span>
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-700">Year the sheet is for</span>
          <input
            inputMode="numeric"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="mt-1 block w-32 rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
        {problem && (
          <p role="alert" className="text-sm text-red-700">
            {problem}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-white disabled:opacity-60"
        >
          {busy ? 'Reading…' : 'Preview'}
        </button>
      </form>

      {preview && (
        <div className="mt-6" aria-label="Preview">
          <p className="text-sm text-gray-700">
            Found {preview.income.length} income lines ({formatMkd(preview.incomeTotalMkd)}) and{' '}
            {preview.expenses.length} expense lines ({formatMkd(preview.expensesTotalMkd)}) for{' '}
            {preview.year}.
          </p>
          {preview.warnings.length > 0 && (
            <div role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">Check these before importing:</p>
              <ul className="mt-1 list-disc pl-5">
                {preview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
          <LineTable title="Income" lines={preview.income} />
          <LineTable title="Expenses" lines={preview.expenses} />
        </div>
      )}
    </section>
  );
}
