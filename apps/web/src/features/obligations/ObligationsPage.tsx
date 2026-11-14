import type {
  CategoriesResponse,
  CreateExtraPaymentData,
  CreateInstallmentData,
  CreateLoanData,
  CreateObligationData,
  CreateRateChangeData,
  PayOffLoanData,
  ObligationsResponse,
} from '@nestmint/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { InstallmentForm } from './InstallmentForm';
import { LoanForm } from './LoanForm';
import { ObligationForm } from './ObligationForm';
import { ObligationItem } from './ObligationItem';

type Load<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

interface PageData {
  obligations: ObligationsResponse;
  groups: CategoriesResponse['groups'];
}

/** The body of an edit: the recurrence cannot change, so only the fields that belong to it. */
function updateBody(values: CreateObligationData) {
  const common = {
    name: values.name,
    payee: values.payee ?? null,
    categoryId: values.categoryId,
    expectedAmountMkd: values.expectedAmountMkd,
    dueDay: values.dueDay,
    startMonth: values.startMonth,
    endMonth: values.endMonth ?? null,
  };
  if (values.recurrence === 'every_n_months') {
    return { ...common, everyNMonths: values.everyNMonths };
  }
  if (values.recurrence === 'custom_months') return { ...common, months: values.months };
  return common;
}

export function ObligationsPage() {
  const { authedGet, authedSend } = useAuth();
  const [page, setPage] = useState<Load<PageData>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [adding, setAdding] = useState<'bill' | 'loan' | 'installment' | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const [obligations, categories] = await Promise.all([
        authedGet<ObligationsResponse>('/obligations'),
        authedGet<CategoriesResponse>('/categories'),
      ]);
      return { obligations, groups: categories.groups };
    })()
      .then((data) => active && setPage({ status: 'ready', data }))
      .catch(() => active && setPage({ status: 'error' }));
    return () => {
      active = false;
    };
  }, [authedGet, attempt]);

  const reload = () => setAttempt((n) => n + 1);

  async function add(values: CreateObligationData) {
    await authedSend('POST', '/obligations', values);
    setAdding(null);
    reload();
  }

  async function addLoan(values: CreateLoanData) {
    await authedSend('POST', '/obligations/loans', values);
    setAdding(null);
    reload();
  }

  async function addInstallment(values: CreateInstallmentData) {
    await authedSend('POST', '/obligations/installments', values);
    setAdding(null);
    reload();
  }

  async function editLoan(id: string, values: CreateLoanData) {
    // The payment and rate change with a rate change, so they are not sent.
    await authedSend('PATCH', `/obligations/${id}`, {
      name: values.name,
      payee: values.lender,
      loanType: values.loanType,
      principalMkd: values.principalMkd,
      categoryId: values.categoryId,
      dueDay: values.dueDay,
      startMonth: values.startMonth,
      endMonth: values.endMonth,
    });
    reload();
  }

  async function changeRate(id: string, values: CreateRateChangeData) {
    await authedSend('POST', `/obligations/${id}/rate-changes`, values);
    reload();
  }

  async function addExtraPayment(id: string, values: CreateExtraPaymentData) {
    await authedSend('POST', `/obligations/${id}/extra-payments`, values);
    reload();
  }

  async function payOff(id: string, values: PayOffLoanData) {
    await authedSend('POST', `/obligations/${id}/payoff`, values);
    reload();
  }

  async function remove(id: string) {
    await authedSend('DELETE', `/obligations/${id}`);
    reload();
  }

  async function archive(id: string) {
    await authedSend('POST', `/obligations/${id}/archive`, {});
    reload();
  }

  async function edit(id: string, values: CreateObligationData) {
    await authedSend('PATCH', `/obligations/${id}`, updateBody(values));
    reload();
  }

  const busy = adding !== null || editing;
  const groups = page.status === 'ready' ? page.data.groups : [];

  return (
    <section className="mx-auto max-w-md p-6">
      <Link to="/bills" className="text-sm text-emerald-700 underline">
        ← Bills
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">Recurring bills</h1>
      <p className="mt-1 text-sm text-gray-500">
        Add a bill, a loan or an installment plan once; each month's payment appears on the Bills
        screen by itself.
      </p>

      {page.status === 'loading' && (
        <p className="mt-6 text-gray-500" role="status">
          Loading…
        </p>
      )}

      {page.status === 'error' && (
        <div role="alert" className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          <p>Could not load your bills.</p>
          <button
            type="button"
            onClick={() => {
              setPage({ status: 'loading' });
              reload();
            }}
            className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      )}

      {page.status === 'ready' && (
        <>
          {adding === 'bill' && (
            <div className="mt-6 rounded-lg border p-4">
              <p className="mb-3 font-medium">Add a recurring bill</p>
              <ObligationForm
                groups={groups}
                submitLabel="Save bill"
                onSave={add}
                onCancel={() => setAdding(null)}
              />
            </div>
          )}
          {adding === 'loan' && (
            <div className="mt-6 rounded-lg border p-4">
              <p className="mb-3 font-medium">Add a loan</p>
              <LoanForm groups={groups} onSave={addLoan} onCancel={() => setAdding(null)} />
            </div>
          )}
          {adding === 'installment' && (
            <div className="mt-6 rounded-lg border p-4">
              <p className="mb-3 font-medium">Add an installment plan</p>
              <InstallmentForm
                groups={groups}
                onSave={addInstallment}
                onCancel={() => setAdding(null)}
              />
            </div>
          )}
          {adding === null && (
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                disabled={editing}
                onClick={() => setAdding('bill')}
                className="w-full rounded-lg bg-emerald-700 px-4 py-3 font-medium text-white disabled:opacity-50"
              >
                Add a recurring bill
              </button>
              <button
                type="button"
                disabled={editing}
                onClick={() => setAdding('loan')}
                className="w-full rounded-lg border border-emerald-700 px-4 py-3 font-medium text-emerald-700 disabled:opacity-50"
              >
                Add a loan
              </button>
              <button
                type="button"
                disabled={editing}
                onClick={() => setAdding('installment')}
                className="w-full rounded-lg border border-emerald-700 px-4 py-3 font-medium text-emerald-700 disabled:opacity-50"
              >
                Add an installment plan
              </button>
            </div>
          )}

          {page.data.obligations.obligations.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">
              No recurring bills yet. Add electricity, water, rent and the like, and each month's
              bills appear here by themselves.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col divide-y rounded-lg border">
              {page.data.obligations.obligations.map((obligation) => (
                <ObligationItem
                  key={obligation.id}
                  obligation={obligation}
                  groups={groups}
                  locked={busy}
                  onEditing={setEditing}
                  onEdit={(values) => edit(obligation.id, values)}
                  onEditLoan={(values) => editLoan(obligation.id, values)}
                  onRateChange={(values) => changeRate(obligation.id, values)}
                  onExtraPayment={(values) => addExtraPayment(obligation.id, values)}
                  onPayOff={(values) => payOff(obligation.id, values)}
                  onDelete={() => remove(obligation.id)}
                  onArchive={() => archive(obligation.id)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
