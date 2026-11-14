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
import { ApiError, apiGet, apiPost, apiSend } from '../../api/client';

type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: UserResponse; accessToken: string };

interface AuthContextValue {
  state: AuthState;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  /** Ends every session of the user, on all devices, then leaves the app. */
  logoutEverywhere: () => Promise<void>;
  /**
   * GET with the access token. If the token has expired (15 minutes), the session is renewed from
   * the refresh cookie and the request is retried once; if that fails the user is logged out.
   */
  authedGet: <T>(path: string) => Promise<T>;
  /** Like authedGet, for changes. The body is sent as JSON; a 204 answer gives back null. */
  authedSend: <T>(
    method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ) => Promise<T>;
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

  const accessToken = state.status === 'authenticated' ? state.accessToken : undefined;
  // A 401 means the server refused the request before doing anything, so retrying a change once
  // with a renewed token cannot apply it twice.
  const authed = useCallback(
    async <T,>(call: (token: string | undefined) => Promise<T>): Promise<T> => {
      try {
        return await call(accessToken);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        const renewed = await restoreSession().catch(() => null);
        if (!renewed) {
          setState({ status: 'anonymous' });
          throw error;
        }
        setState(toAuthenticated(renewed));
        return call(renewed.accessToken);
      }
    },
    [accessToken],
  );

  const authedGet = useCallback(
    <T,>(path: string): Promise<T> => authed((token) => apiGet<T>(path, token)),
    [authed],
  );

  const authedSend = useCallback(
    <T,>(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> =>
      authed((token) => apiSend<T>(method, path, body, token)),
    [authed],
  );

  const logoutEverywhere = useCallback(async () => {
    await authedSend<null>('POST', '/me/logout-all');
    setState({ status: 'anonymous' });
  }, [authedSend]);

  const value = useMemo(
    () => ({ state, login, logout, logoutEverywhere, authedGet, authedSend }),
    [state, login, logout, logoutEverywhere, authedGet, authedSend],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
