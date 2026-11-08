import { HttpException } from '@nestjs/common';
import { ErrorCode } from '@nestmint/shared';
import { describe, expect, it } from 'vitest';
import { FakeClock, InMemoryUsers } from '../testing/fakes.js';
import { AuthService } from './auth.service.js';
import { LoginRateLimiter } from './login-rate-limiter.js';
import { PasswordHasher } from './password-hasher.js';

const input = { email: 'filip@example.com', password: 'correct-horse-battery' };

function setup() {
  const users = new InMemoryUsers();
  const hasher = new PasswordHasher();
  const clock = new FakeClock();
  return {
    users,
    hasher,
    clock,
    service: new AuthService(users, hasher, new LoginRateLimiter(clock)),
  };
}

function errorOf(error: unknown): { status: number; code: string; message: string } {
  if (!(error instanceof HttpException)) throw error;
  const body = error.getResponse() as { error: { code: string; message: string } };
  return { status: error.getStatus(), code: body.error.code, message: body.error.message };
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
    expect(errorOf(error).code).toBe(ErrorCode.EmailAlreadyRegistered);
  });

  it('maps a concurrent duplicate insert to the same error', async () => {
    const { users, service } = setup();
    users.raceOnCreate = true;
    const error = await service.register(input).catch((e: unknown) => e);
    expect(errorOf(error).code).toBe(ErrorCode.EmailAlreadyRegistered);
  });
});

describe('AuthService.authenticate', () => {
  it('returns the user for the right password', async () => {
    const { service } = setup();
    await service.register(input);
    const user = await service.authenticate(input, '1.1.1.1');
    expect(user.email).toBe(input.email);
  });

  it('gives the identical error for a wrong password and an unknown email', async () => {
    const { service } = setup();
    await service.register(input);

    const wrongPassword = await service
      .authenticate({ ...input, password: 'wrong-password-123' }, '1.1.1.1')
      .catch((e: unknown) => e);
    const unknownEmail = await service
      .authenticate({ email: 'nobody@example.com', password: 'whatever-123456' }, '1.1.1.1')
      .catch((e: unknown) => e);

    expect(errorOf(wrongPassword)).toEqual(errorOf(unknownEmail));
    expect(errorOf(wrongPassword)).toMatchObject({
      status: 401,
      code: ErrorCode.InvalidCredentials,
    });
  });

  it('blocks after 10 failures and recovers after the window', async () => {
    const { service, clock } = setup();
    await service.register(input);
    const wrong = { ...input, password: 'wrong-password-123' };

    for (let i = 0; i < 10; i++) {
      await service.authenticate(wrong, '1.1.1.1').catch(() => undefined);
    }
    const blocked = await service.authenticate(input, '1.1.1.1').catch((e: unknown) => e);
    expect(errorOf(blocked)).toMatchObject({ status: 429, code: ErrorCode.TooManyRequests });

    const otherClient = await service.authenticate(input, '2.2.2.2');
    expect(otherClient.email).toBe(input.email);

    clock.advance(16 * 60 * 1000);
    expect((await service.authenticate(input, '1.1.1.1')).email).toBe(input.email);
  });

  it('a successful login clears earlier failures', async () => {
    const { service } = setup();
    await service.register(input);
    const wrong = { ...input, password: 'wrong-password-123' };

    for (let i = 0; i < 9; i++) await service.authenticate(wrong, '1.1.1.1').catch(() => undefined);
    await service.authenticate(input, '1.1.1.1');
    for (let i = 0; i < 9; i++) await service.authenticate(wrong, '1.1.1.1').catch(() => undefined);

    expect((await service.authenticate(input, '1.1.1.1')).email).toBe(input.email);
  });
});
