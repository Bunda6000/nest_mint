export const PASSWORD_RESET_TOKENS_REPOSITORY = Symbol('PASSWORD_RESET_TOKENS_REPOSITORY');

export interface PasswordResetTokenRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
}

export interface PasswordResetTokensRepository {
  create(token: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  findByHash(tokenHash: string): Promise<PasswordResetTokenRecord | null>;
  /** Marks used. Returns false when it was already used (two clicks at once), so only one wins. */
  markUsed(id: string, at: Date): Promise<boolean>;
  /** Every other unused link of the user stops working once a password is set. */
  invalidateAllForUser(userId: string, at: Date): Promise<void>;
}
