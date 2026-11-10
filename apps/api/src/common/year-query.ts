import { HttpStatus } from '@nestjs/common';
import { ErrorCode, yearSchema } from '@nestmint/shared';
import { ApiException } from './api.exception.js';

/** The `?year=2026` of a request: a year from 2000 on, else a 400 naming the field. */
export function parseYearQuery(year: unknown): number {
  const parsed = yearSchema.safeParse(year);
  if (!parsed.success) {
    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.ValidationFailed,
      'Some fields are invalid.',
      { year: parsed.error.issues[0]!.message },
    );
  }
  return parsed.data;
}
