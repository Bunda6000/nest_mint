import { HttpStatus, Injectable, type PipeTransform } from '@nestjs/common';
import { ErrorCode, fieldErrors } from '@nestmint/shared';
import type { ZodType } from 'zod';
import { ApiException } from './api.exception.js';

/** Validates and transforms a request body with a shared Zod schema. */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.ValidationFailed,
        'Some fields are invalid.',
        fieldErrors(result.error),
      );
    }
    return result.data;
  }
}
