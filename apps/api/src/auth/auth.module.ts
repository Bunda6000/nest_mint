import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Clock } from '../common/clock.js';
import { UsersModule } from '../users/users.module.js';
import { AccessTokenService } from './access-token.service.js';
import { AuthConfig, loadAuthConfig } from './auth.config.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { LoginRateLimiter } from './login-rate-limiter.js';
import { MeController } from './me.controller.js';
import { OriginGuard } from './origin.guard.js';
import { EMAIL_SENDER, LogEmailSender } from './email-sender.js';
import { PasswordHasher } from './password-hasher.js';
import { PASSWORD_RESET_TOKENS_REPOSITORY } from './password-reset-tokens.repository.js';
import { PasswordResetService } from './password-reset.service.js';
import { PrismaPasswordResetTokensRepository } from './prisma-password-reset-tokens.repository.js';
import { PrismaRefreshTokensRepository } from './prisma-refresh-tokens.repository.js';
import { REFRESH_TOKENS_REPOSITORY } from './refresh-tokens.repository.js';
import { SessionService } from './session.service.js';

@Module({
  imports: [UsersModule],
  controllers: [AuthController, MeController],
  providers: [
    Clock,
    { provide: AuthConfig, useFactory: () => loadAuthConfig() },
    { provide: REFRESH_TOKENS_REPOSITORY, useClass: PrismaRefreshTokensRepository },
    { provide: PASSWORD_RESET_TOKENS_REPOSITORY, useClass: PrismaPasswordResetTokensRepository },
    { provide: EMAIL_SENDER, useClass: LogEmailSender },
    PasswordResetService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    AccessTokenService,
    AuthService,
    LoginRateLimiter,
    OriginGuard,
    PasswordHasher,
    SessionService,
  ],
  exports: [SessionService],
})
export class AuthModule {}
