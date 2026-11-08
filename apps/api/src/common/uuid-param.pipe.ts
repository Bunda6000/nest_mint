import { HttpStatus, Injectable, type PipeTransform } from '@nestjs/common';
import { ErrorCode } from '@nestmint/shared';
import { z } from 'zod';
import { ApiException } from './api.exception.js';

const uuid = z.uuid();

/** A path id that is not a UUID cannot exist, so it is "not found" rather than a database error. */
@Injectable()
export class UuidParamPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!uuid.safeParse(value).success) {
      throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.NotFound, 'Not found.');
    }
    return value;
  }
}
