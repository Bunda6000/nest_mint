import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '@nestmint/shared';
import { ApiException } from '../common/api.exception.js';
import { Clock } from '../common/clock.js';

const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;

/**
 * Limits failed logins per key (client IP + email). In-memory, so each server instance counts
 * separately; a firewall rule in front of the API is the stronger, shared protection.
 */
@Injectable()
export class LoginRateLimiter {
  private readonly failures = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly clock: Clock) {}

  assertAllowed(key: string): void {
    const entry = this.active(key);
    if (entry && entry.count >= MAX_FAILURES) {
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCode.TooManyRequests,
        'Too many failed attempts. Try again in a few minutes.',
      );
    }
  }

  recordFailure(key: string): void {
    const now = this.clock.now().getTime();
    const entry = this.active(key);
    if (entry) {
      entry.count += 1;
    } else {
      this.failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
    }
  }

  reset(key: string): void {
    this.failures.delete(key);
  }

  private active(key: string): { count: number; resetAt: number } | undefined {
    const entry = this.failures.get(key);
    if (entry && entry.resetAt <= this.clock.now().getTime()) {
      this.failures.delete(key);
      return undefined;
    }
    return entry;
  }
}
