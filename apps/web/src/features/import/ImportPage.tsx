import type {
  BudgetImportCommitResponse,
  BudgetImportPreviewResponse,
  CategoriesResponse,
  ImportLineResponse,
} from '@nestmint/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../../api/client';
import { formatMkd } from '../../format';
import { useAuth } from '../auth/AuthContext';
import { parseAmount } from '../spending/amount';
import { currentMonth, formatMonth, shortMonth } from '../spending/months';

interface CategoryOption {
  id: string;
  label: string;
}

/** What the user entered for each anomaly: an amount, or "0" for "leave it empty". */
type Fixes = Record<string, string>;
const fixKey = (lineKey: string, month: string) => `${lineKey}@${month}`;

function LineRow({
  line,
  expense,
  categories,
  categoryId,
  skipped,
  onCategory,
  onSkip,
}: {
  line: ImportLineResponse;
  expense: boolean;
  categories: CategoryOption[];
  categoryId: string;
  skipped: boolean;
  onCategory: (id: string) => void;
  onSkip: (skip: boolean) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-2 p-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-gray-900">{line.name}</span>
        <span className="block text-xs text-gray-500">
          {line.section} ·{' '}
          {Object.keys(line.amountsMkd)
            .map((m) => shortMonth(m))
            .join(', ') || 'no amounts'}
        </span>
      </span>
      <span className="tabular-nums">{formatMkd(line.totalMkd)}</span>
      {expense && (
        <select
          aria-label={`Category for ${line.name}`}
          value={categoryId}
          disabled={skipped}
          onChange={(e) => onCategory(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1"
        >
          <option value="">Choose a category…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      )}
      <label className="flex items-center gap-1 text-xs text-gray-600">
        <input
          type="checkbox"
          checked={skipped}
          onChange={(e) => onSkip(e.target.checked)}
          aria-label={`Skip ${line.name}`}
        />
        Skip
      </label>
    </li>
  );
}

/** NM-32/33/34: pick Budget.xlsx, review what it contains, fix anomalies, then save. */
export function ImportPage() {
  const { authedGet, authedSend } = useAuth();
  const [year, setYear] = useState(String(Number(currentMonth().slice(0, 4))));
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [preview, setPreview] = useState<BudgetImportPreviewResponse | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const [fixes, setFixes] = useState<Fixes>({});
  const [done, setDone] = useState<BudgetImportCommitResponse | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!file) return setProblem('Choose the .xlsx file to import');
    setBusy(true);
    setProblem(null);
    setPreview(null);
    setDone(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('year', year);
      const [result, groups] = await Promise.all([
        authedSend<BudgetImportPreviewResponse>('POST', '/imports/budget/preview', form),
        authedGet<CategoriesResponse>('/categories'),
      ]);
      setCategories(
        groups.groups.flatMap((g) =>
          g.categories.map((c) => ({ id: c.id, label: `${g.name} · ${c.name}` })),
        ),
      );
      setChosen(
        Object.fromEntries(
          result.expenses.flatMap((l) =>
            l.suggestedCategoryId ? [[l.key, l.suggestedCategoryId]] : [],
          ),
        ),
      );
      setSkipped({});
      setFixes({});
      setPreview(result);
    } catch (error) {
      setProblem(
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const fixValue = (lineKey: string, month: string) => fixes[fixKey(lineKey, month)];
  const fixAmount = (lineKey: string, month: string) => {
    const text = fixValue(lineKey, month);
    if (text === undefined) return null;
    const parsed = parseAmount(text);
    return parsed.status === 'ok' ? parsed.value : null;
  };

  const unresolved = preview
    ? preview.anomalies.filter((a) => fixAmount(a.lineKey, a.month) === null).length
    : 0;
  const missingCategory = preview
    ? preview.expenses.filter((l) => !skipped[l.key] && !chosen[l.key]).length
    : 0;

  async function commit() {
    if (busy || !preview || !file) return;
    setBusy(true);
    setProblem(null);
    try {
      const lines: Record<string, { categoryId?: string; skip?: boolean }> = {};
      for (const line of preview.income) lines[line.key] = { skip: !!skipped[line.key] };
      for (const line of preview.expenses) {
        lines[line.key] = skipped[line.key] ? { skip: true } : { categoryId: chosen[line.key]! };
      }
      const decided = preview.anomalies.map((a) => ({
        lineKey: a.lineKey,
        month: a.month,
        amountMkd: fixAmount(a.lineKey, a.month) ?? 0,
      }));
      const form = new FormData();
      form.append('file', file);
      form.append('year', String(preview.year));
      form.append('decisions', JSON.stringify({ lines, fixes: decided }));
      setDone(await authedSend<BudgetImportCommitResponse>('POST', '/imports/budget/commit', form));
      setPreview(null);
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
        Reads the “Буџет” sheet. You review everything below before anything is saved.
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
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-white disabled:opacity-60"
        >
          {busy && !preview ? 'Reading…' : 'Preview'}
        </button>
      </form>

      {problem && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {problem}
        </p>
      )}

      {done && (
        <p role="status" className="mt-6 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          Saved {done.incomeCreated} income entries ({formatMkd(done.incomeTotalMkd)}) and{' '}
          {done.expensesCreated} expenses ({formatMkd(done.expensesTotalMkd)}) for {done.year}.
        </p>
      )}

      {preview && (
        <div className="mt-6" aria-label="Preview">
          <p className="text-sm text-gray-700">
            Found {preview.income.length} income lines ({formatMkd(preview.incomeTotalMkd)}) and{' '}
            {preview.expenses.length} expense lines ({formatMkd(preview.expensesTotalMkd)}) for{' '}
            {preview.year}.
          </p>

          {preview.warnings.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">The sheet’s own totals disagree with its lines:</p>
              <ul className="mt-1 list-disc pl-5">
                {preview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {preview.anomalies.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
              <h3 className="font-medium text-amber-900">Confirm or fix ({unresolved} left)</h3>
              <ul className="mt-2 space-y-2">
                {preview.anomalies.map((a) => {
                  const value = fixValue(a.lineKey, a.month);
                  return (
                    <li
                      key={fixKey(a.lineKey, a.month)}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <span className="min-w-0 flex-1 text-amber-900">
                        {a.name} · {formatMonth(a.month)}: {a.message}
                      </span>
                      <input
                        aria-label={`Amount for ${a.name} in ${formatMonth(a.month)}`}
                        inputMode="numeric"
                        value={value ?? ''}
                        onChange={(e) =>
                          setFixes((f) => ({ ...f, [fixKey(a.lineKey, a.month)]: e.target.value }))
                        }
                        className="w-28 rounded-lg border border-gray-300 px-2 py-1"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setFixes((f) => ({ ...f, [fixKey(a.lineKey, a.month)]: '0' }))
                        }
                        className="rounded-lg border border-gray-300 bg-white px-2 py-1"
                      >
                        Leave empty
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {(['income', 'expenses'] as const).map((side) =>
            preview[side].length === 0 ? null : (
              <div key={side} className="mt-4">
                <h3 className="font-medium text-gray-900">
                  {side === 'income' ? 'Income' : 'Expenses'}
                </h3>
                <ul className="mt-1 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white text-sm">
                  {preview[side].map((line) => (
                    <LineRow
                      key={line.key}
                      line={line}
                      expense={side === 'expenses'}
                      categories={categories}
                      categoryId={chosen[line.key] ?? ''}
                      skipped={!!skipped[line.key]}
                      onCategory={(id) => setChosen((c) => ({ ...c, [line.key]: id }))}
                      onSkip={(skip) => setSkipped((s) => ({ ...s, [line.key]: skip }))}
                    />
                  ))}
                </ul>
              </div>
            ),
          )}

          <button
            type="button"
            onClick={commit}
            disabled={busy || unresolved > 0 || missingCategory > 0}
            className="mt-6 rounded-lg bg-emerald-700 px-4 py-2 text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save import'}
          </button>
          {(unresolved > 0 || missingCategory > 0) && (
            <p className="mt-2 text-sm text-gray-600">
              {unresolved > 0 && `${unresolved} item(s) to confirm. `}
              {missingCategory > 0 && `${missingCategory} expense line(s) need a category or Skip.`}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
