import type { LoginInput, SessionResponse, UserResponse } from '@nestmint/shared';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ApiError, apiPost } from '../../api/client';

type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: UserResponse; accessToken: string };

interface AuthContextValue {
  state: AuthState;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

let pendingRefresh: Promise<SessionResponse | null> | null = null;

/**
 * Restores a session from the refresh cookie. Shared between callers: the server rotates the
 * refresh token on every use, so two simultaneous requests (React StrictMode runs effects twice
 * in development) must not both spend the same token.
 */
function restoreSession(): Promise<SessionResponse | null> {
  pendingRefresh ??= apiPost<SessionResponse>('/auth/refresh')
    .catch((error: unknown) => {
      if (error instanceof ApiError) return null;
      throw error;
    })
    .finally(() => {
      pendingRefresh = null;
    });
  return pendingRefresh;
}

function toAuthenticated(session: SessionResponse): AuthState {
  return { status: 'authenticated', user: session.user, accessToken: session.accessToken };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    restoreSession()
      .then(
        (session) =>
          active && setState(session ? toAuthenticated(session) : { status: 'anonymous' }),
      )
      .catch(() => active && setState({ status: 'anonymous' }));
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const session = await apiPost<SessionResponse>('/auth/login', input);
    setState(toAuthenticated(session));
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiPost('/auth/logout');
    } finally {
      // Leave the app even if the server could not be reached; the cookie expires on its own.
      setState({ status: 'anonymous' });
    }
  }, []);

  const value = useMemo(() => ({ state, login, logout }), [state, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
