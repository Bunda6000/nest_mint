import { HttpException } from '@nestjs/common';
import { ErrorCode } from '@nestmint/shared';
import { describe, expect, it } from 'vitest';
import type { NewUser, User } from '../users/user.entity.js';
import { DuplicateEmailError, type UsersRepository } from '../users/users.repository.js';
import { AuthService } from './auth.service.js';
import { PasswordHasher } from './password-hasher.js';

class InMemoryUsers implements UsersRepository {
  readonly rows: User[] = [];
  raceOnCreate = false;

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

const input = { email: 'filip@example.com', password: 'correct-horse-battery' };

function setup() {
  const users = new InMemoryUsers();
  const hasher = new PasswordHasher();
  return { users, hasher, service: new AuthService(users, hasher) };
}

function codeOf(error: unknown): string | undefined {
  return error instanceof HttpException
    ? (error.getResponse() as { error: { code: string } }).error.code
    : undefined;
}

describe('AuthService.register', () => {
  it('stores an Argon2id hash, never the plain password, and returns no hash', async () => {
    const { users, hasher, service } = setup();
    const result = await service.register(input);

    const stored = users.rows[0]!;
    expect(stored.passwordHash).not.toContain(input.password);
    expect(stored.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(await hasher.verify(stored.passwordHash, input.password)).toBe(true);
    expect(result).toEqual({ id: 'id-1', email: input.email, displayName: null });
  });

  it('rejects an email that is already registered', async () => {
    const { service } = setup();
    await service.register(input);
    const error = await service.register(input).catch((e: unknown) => e);
    expect(codeOf(error)).toBe(ErrorCode.EmailAlreadyRegistered);
  });

  it('maps a concurrent duplicate insert to the same error', async () => {
    const { users, service } = setup();
    users.raceOnCreate = true;
    const error = await service.register(input).catch((e: unknown) => e);
    expect(codeOf(error)).toBe(ErrorCode.EmailAlreadyRegistered);
  });
});
