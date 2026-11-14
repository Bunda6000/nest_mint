import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  type LoginData,
  type PasswordResetConfirmData,
  passwordResetConfirmSchema,
  type PasswordResetRequestData,
  passwordResetRequestSchema,
  loginSchema,
  type RegisterData,
  registerSchema,
  type SessionResponse,
  type UserResponse,
} from '@nestmint/shared';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuthConfig } from './auth.config.js';
import { AuthService } from './auth.service.js';
import { OriginGuard } from './origin.guard.js';
import { PasswordResetService } from './password-reset.service.js';
import { Public } from './public.decorator.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './refresh-cookie.js';
import { type IssuedSession, SessionService } from './session.service.js';
import { ApiException } from '../common/api.exception.js';
import { ErrorCode } from '@nestmint/shared';

@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly config: AuthConfig,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(
    @Body(new ZodValidationPipe<RegisterData>(registerSchema)) body: RegisterData,
  ): Promise<UserResponse> {
    return this.auth.register(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe<LoginData>(loginSchema)) body: LoginData,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const user = await this.auth.authenticate(body, clientIp(req));
    return this.respondWith(res, await this.sessions.start(user));
  }

  /** Always 204, whether or not the email has an account. */
  @Post('password-reset/request')
  @HttpCode(HttpStatus.NO_CONTENT)
  async requestReset(
    @Body(new ZodValidationPipe<PasswordResetRequestData>(passwordResetRequestSchema))
    body: PasswordResetRequestData,
    @Req() req: Request,
  ): Promise<void> {
    await this.passwordReset.request(body.email, clientIp(req));
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmReset(
    @Body(new ZodValidationPipe<PasswordResetConfirmData>(passwordResetConfirmSchema))
    body: PasswordResetConfirmData,
  ): Promise<void> {
    await this.passwordReset.confirm(body.token, body.password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OriginGuard)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const token = readRefreshCookie(req);
    if (!token) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, ErrorCode.Unauthorized, 'Please log in.');
    }
    try {
      return this.respondWith(res, await this.sessions.refresh(token));
    } catch (error) {
      clearRefreshCookie(res, this.config.cookieSecure);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(OriginGuard)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = readRefreshCookie(req);
    if (token) await this.sessions.end(token);
    clearRefreshCookie(res, this.config.cookieSecure);
  }

  private respondWith(res: Response, issued: IssuedSession): SessionResponse {
    setRefreshCookie(res, issued.refreshToken, issued.refreshExpiresAt, this.config.cookieSecure);
    return issued.session;
  }
}

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || req.ip || 'unknown';
}
