import { Clock } from '../common/clock.js';
import type {
  NewRefreshToken,
  RefreshTokenRecord,
  RefreshTokensRepository,
  RevokeReason,
} from '../auth/refresh-tokens.repository.js';
import type { NewUser, User } from '../users/user.entity.js';
import { DuplicateEmailError, type UsersRepository } from '../users/users.repository.js';

export class InMemoryUsers implements UsersRepository {
  readonly rows: User[] = [];
  raceOnCreate = false;

  async findById(id: string): Promise<User | null> {
    return this.rows.find((u) => u.id === id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.rows.find((u) => u.email === email) ?? null;
  }

  async create(user: NewUser): Promise<User> {
    if (this.raceOnCreate) throw new DuplicateEmailError();
    const row: User = { id: `id-${this.rows.length + 1}`, displayName: null, ...user };
    this.rows.push(row);
    return row;
  }
}

interface StoredToken extends RefreshTokenRecord {
  tokenHash: string;
}

export class InMemoryRefreshTokens implements RefreshTokensRepository {
  readonly rows: StoredToken[] = [];

  async create(token: NewRefreshToken): Promise<void> {
    this.rows.push({
      id: `rt-${this.rows.length + 1}`,
      revokedAt: null,
      revokeReason: null,
      ...token,
    });
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.rows.find((r) => r.tokenHash === tokenHash) ?? null;
  }

  async revoke(id: string, reason: RevokeReason, at: Date): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) Object.assign(row, { revokedAt: at, revokeReason: reason });
  }

  async revokeAllForUser(userId: string, reason: RevokeReason, at: Date): Promise<void> {
    for (const row of this.rows) {
      if (row.userId === userId && !row.revokedAt) {
        Object.assign(row, { revokedAt: at, revokeReason: reason });
      }
    }
  }

  active(userId: string): number {
    return this.rows.filter((r) => r.userId === userId && !r.revokedAt).length;
  }
}

/** A clock the test can move forward. */
export class FakeClock extends Clock {
  private current = new Date('2026-11-08T10:00:00Z');

  override now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
