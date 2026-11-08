import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '@nestmint/shared';
import type { Request } from 'express';
import { ApiException } from '../common/api.exception.js';
import { AuthConfig } from './auth.config.js';

/**
 * Protects cookie-based endpoints (refresh, logout) against cross-site requests: when a browser
 * sends an Origin header, it must be one of our web origins. Requests without it come from
 * non-browser clients, which cannot be tricked into attaching the user's cookie.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly config: AuthConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const origin = context.switchToHttp().getRequest<Request>().headers.origin;
    if (origin && !this.config.allowedOrigins.includes(origin)) {
      throw new ApiException(HttpStatus.FORBIDDEN, ErrorCode.Forbidden, 'Request not allowed.');
    }
    return true;
  }
}
