import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../testing/fakes.js';
import {
  AUTH_LIMIT,
  GENERAL_LIMIT,
  RequestRateLimitGuard,
  WINDOW_MS,
} from './request-rate-limit.guard.js';

function context(path: string, ip: string): ExecutionContext {
  const req = { path, headers: {}, ip };
  const res = { setHeader: () => undefined };
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
}

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { getResponse: () => { error: { code: string } } }).getResponse().error.code;
  }
  return undefined;
}

describe('RequestRateLimitGuard', () => {
  it('lets auth calls through up to the lower limit, then blocks that address only', () => {
    const guard = new RequestRateLimitGuard(new FakeClock());
    for (let i = 0; i < AUTH_LIMIT; i++)
      expect(guard.canActivate(context('/api/v1/auth/login', '1.1.1.1'))).toBe(true);
    expect(code(() => guard.canActivate(context('/api/v1/auth/login', '1.1.1.1')))).toBe(
      'TOO_MANY_REQUESTS',
    );
    expect(guard.canActivate(context('/api/v1/auth/login', '2.2.2.2'))).toBe(true);
    // the general budget is separate
    expect(guard.canActivate(context('/api/v1/summary', '1.1.1.1'))).toBe(true);
  });

  it('starts a fresh window after a minute', () => {
    const clock = new FakeClock();
    const guard = new RequestRateLimitGuard(clock);
    for (let i = 0; i < GENERAL_LIMIT; i++)
      guard.canActivate(context('/api/v1/summary', '1.1.1.1'));
    expect(code(() => guard.canActivate(context('/api/v1/summary', '1.1.1.1')))).toBe(
      'TOO_MANY_REQUESTS',
    );
    clock.advance(WINDOW_MS + 1);
    expect(guard.canActivate(context('/api/v1/summary', '1.1.1.1'))).toBe(true);
  });
});
