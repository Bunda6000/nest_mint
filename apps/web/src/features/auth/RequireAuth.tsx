import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from './AuthContext';

/** Shows the page to logged-in users and sends everyone else to the login page. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  if (state.status === 'loading') {
    return (
      <p className="p-6 text-gray-500" role="status">
        Loading…
      </p>
    );
  }
  if (state.status === 'anonymous') return <Navigate to="/login" replace />;
  return children;
}
