import { vi } from 'vitest';

type Reply = { status: number; body?: unknown };
type Handler = Reply | (() => Reply);

/** Replaces fetch with a fake API. Keys look like "POST /auth/login". Unlisted calls fail the test. */
export function mockApi(handlers: Record<string, Handler>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(/^.*\/api\/v1/, '');
    const key = `${init?.method ?? 'GET'} ${path}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`Unexpected API call: ${key}`);
    const { status, body } = typeof handler === 'function' ? handler() : handler;
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  });
  vi.stubGlobal('fetch', fetchMock);

  return {
    fetchMock,
    calls: (key: string) =>
      fetchMock.mock.calls.filter(([input, init]) => {
        const path = String(input).replace(/^.*\/api\/v1/, '');
        return `${init?.method ?? 'GET'} ${path}` === key;
      }),
  };
}

export const session = {
  accessToken: 'access-token',
  expiresIn: 900,
  user: { id: 'u1', email: 'filip@example.com', displayName: 'Filip' },
};

export const unauthorized = {
  status: 401,
  body: { error: { code: 'UNAUTHORIZED', message: 'Please log in again.' } },
};
