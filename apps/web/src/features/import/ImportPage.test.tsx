import type { BudgetImportPreviewResponse } from '@nestmint/shared';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportPage } from './ImportPage';

const auth = vi.hoisted(() => ({ authedSend: vi.fn(), authedGet: vi.fn() }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }));

const preview: BudgetImportPreviewResponse = {
  year: 2025,
  sheetName: 'Буџет',
  income: [
    {
      key: 'Приходи|Плата',
      section: 'Приходи',
      name: 'Плата',
      amountsMkd: { '2025-01': 127_088 },
      totalMkd: 127_088,
      suggestedCategoryId: null,
      suggestedCategoryName: null,
    },
  ],
  expenses: [
    {
      key: 'Дома|Струја',
      section: 'Дома',
      name: 'Струја',
      amountsMkd: { '2025-01': 3_460 },
      totalMkd: 3_460,
      suggestedCategoryId: 'c1',
      suggestedCategoryName: 'Electricity',
    },
    {
      key: 'Банки|Станбен',
      section: 'Банки',
      name: 'Станбен',
      amountsMkd: { '2025-01': 15_437, '2025-03': 15_500 },
      totalMkd: 30_937,
      suggestedCategoryId: null,
      suggestedCategoryName: null,
    },
  ],
  incomeTotalMkd: 127_088,
  expensesTotalMkd: 34_397,
  monthlyIncomeMkd: {},
  monthlyExpensesMkd: {},
  anomalies: [
    {
      kind: 'gap',
      lineKey: 'Банки|Станбен',
      section: 'Банки',
      name: 'Станбен',
      month: '2025-02',
      message: 'Empty between months that have an amount',
    },
  ],
  warnings: ["Дома, 2025-01: the sheet's total is 1 but its lines add up to 3460"],
};

const committed = {
  year: 2025,
  incomeCreated: 1,
  expensesCreated: 4,
  incomeTotalMkd: 127_088,
  expensesTotalMkd: 49_797,
};

beforeEach(() => {
  auth.authedGet.mockResolvedValue({
    groups: [
      {
        id: 'g1',
        name: 'Home',
        categories: [
          { id: 'c1', name: 'Electricity' },
          { id: 'c2', name: 'Mortgage' },
        ],
      },
    ],
  });
  auth.authedSend.mockImplementation(async (_m: string, path: string) =>
    path.endsWith('/commit') ? committed : preview,
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <ImportPage />
    </MemoryRouter>,
  );

async function openPreview(user: ReturnType<typeof userEvent.setup>) {
  renderPage();
  await user.upload(screen.getByLabelText(/Workbook/), new File(['x'], 'Budget.xlsx'));
  await user.click(screen.getByRole('button', { name: 'Preview' }));
  await screen.findByText(/Found 1 income lines/);
}

describe('ImportPage', () => {
  it('asks for a file first', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Choose the .xlsx file/);
    expect(auth.authedSend).not.toHaveBeenCalled();
  });

  it('uploads the file with the year and shows lines, suggestions and warnings', async () => {
    const user = userEvent.setup();
    await openPreview(user);
    const [method, path, form] = auth.authedSend.mock.calls[0] as [string, string, FormData];
    expect([method, path]).toEqual(['POST', '/imports/budget/preview']);
    expect(form.get('year')).toBe(String(new Date().getFullYear()));
    expect((form.get('file') as File).name).toBe('Budget.xlsx');
    expect(screen.getByText(/the sheet's total is 1/)).toBeTruthy();
    expect((screen.getByLabelText('Category for Струја') as HTMLSelectElement).value).toBe('c1');
  });

  it('blocks saving until the anomaly is resolved and every expense has a category', async () => {
    const user = userEvent.setup();
    await openPreview(user);
    const save = screen.getByRole('button', { name: 'Save import' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Leave empty' }));
    expect(save.disabled).toBe(true); // Станбен still has no category
    await user.selectOptions(screen.getByLabelText('Category for Станбен'), 'c2');
    expect(save.disabled).toBe(false);
  });

  it('sends the review and shows what was saved', async () => {
    const user = userEvent.setup();
    await openPreview(user);
    await user.type(screen.getByLabelText(/Amount for Станбен/), '15400');
    await user.selectOptions(screen.getByLabelText('Category for Станбен'), 'c2');
    await user.click(screen.getByLabelText('Skip Плата'));
    await user.click(screen.getByRole('button', { name: 'Save import' }));

    const call = auth.authedSend.mock.calls.find((c) => String(c[1]).endsWith('/commit'))!;
    const form = call[2] as FormData;
    expect(JSON.parse(String(form.get('decisions')))).toEqual({
      lines: {
        'Приходи|Плата': { skip: true },
        'Дома|Струја': { categoryId: 'c1' },
        'Банки|Станбен': { categoryId: 'c2' },
      },
      fixes: [{ lineKey: 'Банки|Станбен', month: '2025-02', amountMkd: 15_400 }],
    });
    const status = await screen.findByRole('status');
    expect(within(status).getByText(/Saved 1 income entries/)).toBeTruthy();
  });
});
