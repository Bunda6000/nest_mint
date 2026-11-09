import { HttpStatus } from '@nestjs/common';
import { ErrorCode, monthSchema } from '@nestmint/shared';
import { ApiException } from './api.exception.js';

/** The `?month=2026-11` of a request: "YYYY-MM" from 2000-01 on, else a 400 naming the field. */
export function parseMonthQuery(month: unknown): string {
  const parsed = monthSchema.safeParse(month);
  if (!parsed.success) {
    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.ValidationFailed,
      'Some fields are invalid.',
      { month: parsed.error.issues[0]!.message },
    );
  }
  return parsed.data;
}
