import type { BudgetImportPreviewResponse } from '@nestmint/shared';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImportPage } from './ImportPage';

const auth = vi.hoisted(() => ({ authedSend: vi.fn() }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const preview: BudgetImportPreviewResponse = {
  year: 2025,
  sheetName: 'Буџет',
  income: [
    {
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
      section: 'Дома',
      name: 'Струја',
      amountsMkd: { '2025-01': 3_460 },
      totalMkd: 3_460,
      suggestedCategoryId: 'c1',
      suggestedCategoryName: 'Electricity',
    },
  ],
  incomeTotalMkd: 127_088,
  expensesTotalMkd: 3_460,
  monthlyIncomeMkd: { '2025-01': 127_088 },
  monthlyExpensesMkd: { '2025-01': 3_460 },
  warnings: ["Дома, 2025-01: the sheet's total is 1 but its lines add up to 3460"],
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <ImportPage />
    </MemoryRouter>,
  );

describe('ImportPage', () => {
  it('asks for a file first', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Choose the .xlsx file/);
    expect(auth.authedSend).not.toHaveBeenCalled();
  });

  it('uploads the file with the year and shows lines, suggestions and warnings', async () => {
    auth.authedSend.mockResolvedValue(preview);
    const user = userEvent.setup();
    renderPage();
    const file = new File(['x'], 'Budget.xlsx');
    await user.upload(screen.getByLabelText(/Workbook/), file);
    await user.click(screen.getByRole('button', { name: 'Preview' }));

    const [method, path, form] = auth.authedSend.mock.calls[0] as [string, string, FormData];
    expect([method, path]).toEqual(['POST', '/imports/budget/preview']);
    expect(form.get('year')).toBe(String(new Date().getFullYear()));
    expect((form.get('file') as File).name).toBe('Budget.xlsx');

    expect(await screen.findByText(/Found 1 income lines/)).toBeTruthy();
    expect(screen.getByText('Струја')).toBeTruthy();
    expect(screen.getByText('→ Electricity')).toBeTruthy();
    expect(screen.getByText(/the sheet's total is 1/)).toBeTruthy();
  });
});
