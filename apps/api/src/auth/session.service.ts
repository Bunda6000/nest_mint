import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ErrorCode, type SessionResponse } from '@nestmint/shared';
import { createHash, randomBytes } from 'node:crypto';
import { ApiException } from '../common/api.exception.js';
import { Clock } from '../common/clock.js';
import type { User } from '../users/user.entity.js';
import { USERS_REPOSITORY, type UsersRepository } from '../users/users.repository.js';
import { AccessTokenService } from './access-token.service.js';
import { AuthConfig } from './auth.config.js';
import {
  REFRESH_TOKENS_REPOSITORY,
  type RefreshTokensRepository,
} from './refresh-tokens.repository.js';

/**
 * A just-rotated token presented again within this window is treated as a concurrent request
 * (two tabs, a retry) rather than theft. Beyond it, reuse revokes all of the user's sessions.
 */
export const ROTATION_GRACE_MS = 10_000;

export interface IssuedSession {
  session: SessionResponse;
  refreshToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    @Inject(REFRESH_TOKENS_REPOSITORY) private readonly tokens: RefreshTokensRepository,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    private readonly accessTokens: AccessTokenService,
    private readonly config: AuthConfig,
    private readonly clock: Clock,
  ) {}

  /** Starts a new session for an already authenticated user. */
  start(user: User): Promise<IssuedSession> {
    return this.issue(user);
  }

  /** Exchanges a refresh token for a new session and rotates the refresh token. */
  async refresh(rawToken: string): Promise<IssuedSession> {
    const record = await this.tokens.findByHash(hashToken(rawToken));
    if (!record) throw unauthorized();

    const now = this.clock.now();
    if (record.revokedAt) {
      const withinGrace =
        record.revokeReason === 'rotated' &&
        now.getTime() - record.revokedAt.getTime() <= ROTATION_GRACE_MS;
      if (!withinGrace) {
        if (record.revokeReason === 'rotated') {
          this.logger.warn(
            `Refresh token reuse detected, revoking sessions of user ${record.userId}`,
          );
          await this.tokens.revokeAllForUser(record.userId, 'reuse', now);
        }
        throw unauthorized();
      }
    } else {
      if (record.expiresAt <= now) throw unauthorized();
      await this.tokens.revoke(record.id, 'rotated', now);
    }

    const user = await this.users.findById(record.userId);
    if (!user) throw unauthorized();
    return this.issue(user);
  }

  /** Revokes the refresh token. Unknown or already revoked tokens are ignored. */
  async end(rawToken: string): Promise<void> {
    const record = await this.tokens.findByHash(hashToken(rawToken));
    if (record && !record.revokedAt) {
      await this.tokens.revoke(record.id, 'logout', this.clock.now());
    }
  }

  private async issue(user: User): Promise<IssuedSession> {
    const refreshToken = randomBytes(32).toString('base64url');
    const refreshExpiresAt = new Date(
      this.clock.now().getTime() + this.config.refreshTtlSeconds * 1000,
    );
    await this.tokens.create({
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiresAt,
    });
    return {
      session: {
        accessToken: await this.accessTokens.sign(user.id),
        expiresIn: this.config.accessTtlSeconds,
        user: { id: user.id, email: user.email, displayName: user.displayName },
      },
      refreshToken,
      refreshExpiresAt,
    };
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function unauthorized(): ApiException {
  return new ApiException(HttpStatus.UNAUTHORIZED, ErrorCode.Unauthorized, 'Please log in again.');
}
