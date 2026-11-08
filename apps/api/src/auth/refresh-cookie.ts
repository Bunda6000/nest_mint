import type { CookieOptions, Request, Response } from 'express';

export const REFRESH_COOKIE = 'nm_refresh';
/** The cookie is only sent to the auth endpoints, never with ordinary API calls. */
const COOKIE_PATH = '/api/v1/auth';

function options(secure: boolean): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'strict', path: COOKIE_PATH };
}

export function setRefreshCookie(
  res: Response,
  token: string,
  expires: Date,
  secure: boolean,
): void {
  res.cookie(REFRESH_COOKIE, token, { ...options(secure), expires });
}

export function clearRefreshCookie(res: Response, secure: boolean): void {
  res.clearCookie(REFRESH_COOKIE, options(secure));
}

export function readRefreshCookie(req: Request): string | null {
  for (const part of req.headers.cookie?.split(';') ?? []) {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator).trim() === REFRESH_COOKIE) {
      return decodeURIComponent(part.slice(separator + 1).trim()) || null;
    }
  }
  return null;
}
