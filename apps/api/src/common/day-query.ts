import { HttpStatus } from '@nestjs/common';
import { ErrorCode, isoDateSchema } from '@nestmint/shared';
import { ApiException } from './api.exception.js';

/** An optional `?asOf=2026-11-09`: a real day, or nothing (then `undefined`); else a 400 naming the field. */
export function parseDayQuery(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  const parsed = isoDateSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.ValidationFailed,
      'Some fields are invalid.',
      { [field]: parsed.error.issues[0]!.message },
    );
  }
  return parsed.data;
}
