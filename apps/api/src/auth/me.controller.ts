import { Controller, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import type { UserResponse } from '@nestmint/shared';
import type { Response } from 'express';
import { AuthConfig } from './auth.config.js';
import { clearRefreshCookie } from './refresh-cookie.js';
import { SessionService } from './session.service.js';
import { AuthService } from './auth.service.js';
import { type AuthenticatedUser, CurrentUser } from './current-user.decorator.js';

@Controller('me')
export class MeController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly config: AuthConfig,
  ) {}

  @Get()
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserResponse> {
    return this.auth.getProfile(user.id);
  }

  /** Log out everywhere: every refresh token of the user is revoked, this device's cookie cleared. */
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.endAll(user.id);
    clearRefreshCookie(res, this.config.cookieSecure);
  }
}
