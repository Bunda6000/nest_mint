import { HttpException, type HttpStatus } from '@nestjs/common';
import type { ApiErrorBody, ErrorCode } from '@nestmint/shared';

/** An HTTP error carrying a stable error code, rendered as the standard ApiErrorBody. */
export class ApiException extends HttpException {
  constructor(
    status: HttpStatus,
    code: ErrorCode,
    message: string,
    details?: Record<string, string>,
  ) {
    const body: ApiErrorBody = { error: { code, message, ...(details ? { details } : {}) } };
    super(body, status);
  }
}
