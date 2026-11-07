import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type ApiErrorBody, ErrorCode } from '@nestmint/shared';
import type { Response } from 'express';

/** Renders every error as ApiErrorBody. Unexpected errors are logged without request data. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      response
        .status(status)
        .json(isApiErrorBody(payload) ? payload : fromHttpException(exception));
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    const body: ApiErrorBody = {
      error: { code: ErrorCode.Internal, message: 'Something went wrong. Please try again.' },
    };
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const { error } = value as { error: unknown };
  return typeof error === 'object' && error !== null && 'code' in error;
}

function fromHttpException(exception: HttpException): ApiErrorBody {
  const code = exception.getStatus() === 404 ? ErrorCode.NotFound : `HTTP_${exception.getStatus()}`;
  return { error: { code, message: exception.message } };
}
