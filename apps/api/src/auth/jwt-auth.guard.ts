import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@nestmint/shared';
import { ApiException } from '../common/api.exception.js';
import { AccessTokenService } from './access-token.service.js';
import type { AuthenticatedRequest } from './current-user.decorator.js';
import { IS_PUBLIC } from './public.decorator.js';

/** Applied to every endpoint. Requires `Authorization: Bearer <access token>` unless @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokens: AccessTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request.headers.authorization);
    const userId = token ? await this.accessTokens.verify(token) : null;
    if (!userId) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, ErrorCode.Unauthorized, 'Please log in.');
    }
    request.user = { id: userId };
    return true;
  }
}

function bearerToken(header: string | undefined): string | null {
  const [scheme, token] = header?.split(' ') ?? [];
  return scheme === 'Bearer' && token ? token : null;
}
