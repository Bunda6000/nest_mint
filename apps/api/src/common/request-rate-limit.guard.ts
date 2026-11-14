import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '@nestmint/shared';
import type { Request, Response } from 'express';
import { ApiException } from './api.exception.js';
import { Clock } from './clock.js';

export const WINDOW_MS = 60_000;
/** Requests per minute and client address. The app makes a handful of calls per screen. */
export const GENERAL_LIMIT = 600;
/** Sign-up, login and password reset are what attackers hammer, so they get a lower ceiling. */
export const AUTH_LIMIT = 60;
const MAX_TRACKED = 10_000;

/**
 * Caps requests per client address (NM-42). In memory: each server instance counts on its own, so
 * the real ceiling is a little higher on a busy deployment. It stops floods and scripted guessing;
 * a platform firewall rule is the stronger shared layer (ADR-037).
 */
@Injectable()
export class RequestRateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly clock: Clock) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const auth = req.path.includes('/auth/');
    const limit = auth ? AUTH_LIMIT : GENERAL_LIMIT;
    const now = this.clock.now().getTime();

    if (this.hits.size > MAX_TRACKED) this.purge(now);
    const key = `${auth ? 'a' : 'g'}|${clientAddress(req)}`;
    let entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + WINDOW_MS };
      this.hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > limit) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCode.TooManyRequests,
        'Too many requests. Try again in a minute.',
      );
    }
    return true;
  }

  private purge(now: number): void {
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}

export function clientAddress(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || req.ip || 'unknown';
}
