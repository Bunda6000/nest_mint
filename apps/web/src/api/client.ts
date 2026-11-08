import type { ApiErrorBody } from '@nestmint/shared';

// Same-origin by default: Vercel (production) and the Vite dev server (local) forward /api to the API.
const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

/** An error returned by the API in the standard ApiErrorBody shape. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, string> = {},
  ) {
    super(message);
  }
}

interface RequestOptions {
  body?: unknown;
  /** Access token, sent as a Bearer header. */
  token?: string;
}

export type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'PUT';

async function request<T>(method: ApiMethod, path: string, options: RequestOptions): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      // Sends the HttpOnly refresh cookie to the auth endpoints.
      credentials: 'include',
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection.');
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (data as ApiErrorBody | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? `HTTP_${response.status}`,
      error?.message ?? 'Something went wrong. Please try again.',
      error?.details,
    );
  }
  return data as T;
}

export function apiGet<T>(path: string, token?: string): Promise<T> {
  return request<T>('GET', path, token ? { token } : {});
}

export function apiSend<T>(
  method: 'POST' | 'PATCH' | 'PUT',
  path: string,
  body: unknown = {},
  token?: string,
): Promise<T> {
  return request<T>(method, path, token ? { body, token } : { body });
}

export function apiPost<T>(path: string, body: unknown = {}, token?: string): Promise<T> {
  return apiSend<T>('POST', path, body, token);
}
