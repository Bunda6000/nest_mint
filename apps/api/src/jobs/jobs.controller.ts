import { Controller, Get, Headers, HttpStatus } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../auth/public.decorator.js';
import { ApiException } from '../common/api.exception.js';
import { ErrorCode } from '@nestmint/shared';
import { type MonthlyJobResult, MonthlyJobService } from './monthly-job.service.js';

/** True when `header` is exactly "Bearer <secret>", compared in constant time. */
export function isCronAuthorized(header: string | undefined, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Called by the scheduler (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`). Not a user
 * endpoint, so it skips the login check and uses its own secret instead; without a configured
 * secret it is closed.
 */
@Public()
@Controller('jobs')
export class JobsController {
  constructor(private readonly monthly: MonthlyJobService) {}

  @Get('monthly')
  run(@Headers('authorization') authorization?: string): Promise<MonthlyJobResult> {
    if (!isCronAuthorized(authorization, process.env.CRON_SECRET)) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, ErrorCode.Unauthorized, 'Not authorized.');
    }
    return this.monthly.run();
  }
}
