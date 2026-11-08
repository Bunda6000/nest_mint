export const REFRESH_TOKENS_REPOSITORY = Symbol('REFRESH_TOKENS_REPOSITORY');

export type RevokeReason = 'rotated' | 'logout' | 'reuse';

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  revokeReason: RevokeReason | null;
}

export interface NewRefreshToken {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface RefreshTokensRepository {
  create(token: NewRefreshToken): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revoke(id: string, reason: RevokeReason, at: Date): Promise<void>;
  /** Revokes every still-active token of the user. */
  revokeAllForUser(userId: string, reason: RevokeReason, at: Date): Promise<void>;
}
