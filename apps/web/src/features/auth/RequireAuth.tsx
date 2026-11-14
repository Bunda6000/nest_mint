import type { ExchangeRatesResponse } from '@nestmint/shared';
import { type ReactNode, useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { setRates } from '../../rates';
import { useAuth } from './AuthContext';

/**
 * Shows the page to logged-in users and sends everyone else to the login page. Once per login it
 * also loads the user's exchange rates, so every euro amount uses them; if that fails the default
 * rate (61.5) is used and the page still opens.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state, authedGet } = useAuth();
  const userId = state.status === 'authenticated' ? state.user.id : null;
  const [ratesFor, setRatesFor] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    authedGet<ExchangeRatesResponse>('/settings/rates')
      .then((result) => setRates(result.rates))
      .catch(() => setRates([]))
      .finally(() => active && setRatesFor(userId));
    return () => {
      active = false;
    };
  }, [authedGet, userId]);

  if (state.status === 'loading' || (userId !== null && ratesFor !== userId)) {
    return (
      <p className="p-6 text-gray-500" role="status">
        Loading…
      </p>
    );
  }
  if (state.status === 'anonymous') return <Navigate to="/login" replace />;
  return children;
}
