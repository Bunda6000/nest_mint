import type { HealthScoreResponse } from '@nestmint/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HealthScoreCard } from './HealthScoreCard';

const auth = vi.hoisted(() => ({ authedGet: vi.fn() }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const factor = (key: HealthScoreResponse['factors'][number]['key'], score: number) => ({
  key,
  score,
  weight: 50,
  detail: `detail of ${key}`,
  tip: `tip for ${key}`,
});

const renderCard = () =>
  render(
    <MemoryRouter>
      <HealthScoreCard />
    </MemoryRouter>,
  );

describe('HealthScoreCard', () => {
  it('shows the score, what to improve and the calculation', async () => {
    const savings = factor('savings_rate', 20);
    auth.authedGet.mockResolvedValue({
      score: 60,
      label: 'good',
      months: ['2026-10'],
      factors: [savings, factor('spending_ratio', 100)],
      improvements: [savings],
    } satisfies HealthScoreResponse);
    renderCard();
    expect(await screen.findByLabelText('Score 60 of 100')).toBeTruthy();
    expect(screen.getByText(/Good/)).toBeTruthy();
    expect(screen.getByText('tip for savings_rate')).toBeTruthy();
    expect(screen.getByText('detail of spending_ratio')).toBeTruthy();
  });

  it('asks for income when there is no score yet', async () => {
    auth.authedGet.mockResolvedValue({
      score: null,
      label: null,
      months: [],
      factors: [],
      improvements: [],
    });
    renderCard();
    expect(await screen.findByText('Add your income to see your score.')).toBeTruthy();
  });

  it('stays out of the way when it cannot load', async () => {
    auth.authedGet.mockRejectedValue(new Error('down'));
    const { container } = renderCard();
    await Promise.resolve();
    expect(container.textContent).toBe('');
  });
});
