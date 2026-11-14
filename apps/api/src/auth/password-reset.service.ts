import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '@nestmint/shared';
import { randomBytes } from 'node:crypto';
import { ApiException } from '../common/api.exception.js';
import { Clock } from '../common/clock.js';
import { USERS_REPOSITORY, type UsersRepository } from '../users/users.repository.js';
import { AuthConfig } from './auth.config.js';
import { EMAIL_SENDER, type EmailSender } from './email-sender.js';
import { LoginRateLimiter } from './login-rate-limiter.js';
import { PasswordHasher } from './password-hasher.js';
import {
  PASSWORD_RESET_TOKENS_REPOSITORY,
  type PasswordResetTokensRepository,
} from './password-reset-tokens.repository.js';
import { hashToken, SessionService } from './session.service.js';

/** How long a reset link works. */
export const RESET_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    @Inject(PASSWORD_RESET_TOKENS_REPOSITORY)
    private readonly tokens: PasswordResetTokensRepository,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionService,
    private readonly limiter: LoginRateLimiter,
    private readonly config: AuthConfig,
    private readonly clock: Clock,
  ) {}

  /**
   * Sends a reset link if the email belongs to an account. The caller always gets the same
   * answer, so nobody can use this form to find out which emails are registered.
   */
  async request(email: string, clientIp: string): Promise<void> {
    const key = `reset|${clientIp}|${email}`;
    this.limiter.assertAllowed(key);
    this.limiter.recordFailure(key); // counts every request, so the form cannot be used to send floods

    const user = await this.users.findByEmail(email);
    if (!user) return;

    const token = randomBytes(32).toString('base64url');
    await this.tokens.create({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(this.clock.now().getTime() + RESET_TTL_MS),
    });
    const origin = this.config.allowedOrigins[0] ?? '';
    await this.email.send({
      to: user.email,
      subject: 'Reset your NestMint password',
      text:
        `Open this link within one hour to choose a new password:\n` +
        `${origin}/reset-password?token=${token}\n\n` +
        `If you did not ask for this, ignore this email; your password stays as it is.`,
    });
    this.logger.log(`Password reset requested: ${user.id}`);
  }

  /** Sets the new password, uses up the link and logs the user out everywhere. */
  async confirm(token: string, password: string): Promise<void> {
    const now = this.clock.now();
    const record = await this.tokens.findByHash(hashToken(token));
    if (
      !record ||
      record.usedAt ||
      record.expiresAt <= now ||
      !(await this.tokens.markUsed(record.id, now))
    ) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.ValidationFailed,
        'This link has expired or was already used. Ask for a new one.',
        { token: 'This link has expired or was already used' },
      );
    }
    await this.users.setPasswordHash(record.userId, await this.hasher.hash(password));
    await this.tokens.invalidateAllForUser(record.userId, now);
    await this.sessions.endAll(record.userId);
    this.logger.log(`Password reset completed: ${record.userId}`);
  }
}
