import { HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeClock, InMemoryRefreshTokens, InMemoryUsers } from '../testing/fakes.js';
import { AccessTokenService } from './access-token.service.js';
import { loadAuthConfig } from './auth.config.js';
import { ROTATION_GRACE_MS, SessionService } from './session.service.js';

const config = loadAuthConfig({ JWT_SECRET: 'x'.repeat(40) });

describe('SessionService', () => {
  let users: InMemoryUsers;
  let tokens: InMemoryRefreshTokens;
  let clock: FakeClock;
  let accessTokens: AccessTokenService;
  let service: SessionService;

  beforeEach(async () => {
    users = new InMemoryUsers();
    tokens = new InMemoryRefreshTokens();
    clock = new FakeClock();
    accessTokens = new AccessTokenService(config, clock);
    service = new SessionService(tokens, users, accessTokens, config, clock);
    await users.create({ email: 'filip@example.com', passwordHash: 'unused' });
  });

  const user = () => users.rows[0]!;
  const status = (error: unknown) => (error instanceof HttpException ? error.getStatus() : -1);

  it('start issues an access token for the user and stores only a hash of the refresh token', async () => {
    const issued = await service.start(user());

    expect(await accessTokens.verify(issued.session.accessToken)).toBe('id-1');
    expect(issued.session.expiresIn).toBe(900);
    expect(issued.session.user).toEqual({
      id: 'id-1',
      email: 'filip@example.com',
      displayName: null,
    });
    expect(tokens.rows).toHaveLength(1);
    expect(JSON.stringify(tokens.rows)).not.toContain(issued.refreshToken);
  });

  it('refresh rotates the token: the old one is revoked and a new one issued', async () => {
    const first = await service.start(user());
    const second = await service.refresh(first.refreshToken);

    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(tokens.active('id-1')).toBe(1);
    expect(tokens.rows[0]!.revokeReason).toBe('rotated');
  });

  it('an access token expires after 15 minutes', async () => {
    const { session } = await service.start(user());
    clock.advance(14 * 60 * 1000);
    expect(await accessTokens.verify(session.accessToken)).toBe('id-1');
    clock.advance(2 * 60 * 1000);
    expect(await accessTokens.verify(session.accessToken)).toBeNull();
  });

  it('rejects a refresh token that is unknown or expired', async () => {
    expect(status(await service.refresh('nonsense').catch((e: unknown) => e))).toBe(401);

    const issued = await service.start(user());
    clock.advance(31 * 24 * 60 * 60 * 1000);
    expect(status(await service.refresh(issued.refreshToken).catch((e: unknown) => e))).toBe(401);
  });

  it('a rotated token used again right away is a concurrent request, not theft', async () => {
    const first = await service.start(user());
    await service.refresh(first.refreshToken);
    clock.advance(ROTATION_GRACE_MS - 1000);

    const again = await service.refresh(first.refreshToken);
    expect(again.session.accessToken).toBeTruthy();
    expect(tokens.active('id-1')).toBe(2);
  });

  it('a rotated token used again after the grace window revokes every session', async () => {
    const first = await service.start(user());
    const second = await service.refresh(first.refreshToken);
    clock.advance(ROTATION_GRACE_MS + 1000);

    expect(status(await service.refresh(first.refreshToken).catch((e: unknown) => e))).toBe(401);
    expect(tokens.active('id-1')).toBe(0);
    expect(status(await service.refresh(second.refreshToken).catch((e: unknown) => e))).toBe(401);
  });

  it('end revokes the token, and ignoring unknown tokens is safe', async () => {
    const issued = await service.start(user());
    await service.end(issued.refreshToken);
    await service.end('nonsense');

    expect(tokens.rows[0]!.revokeReason).toBe('logout');
    expect(status(await service.refresh(issued.refreshToken).catch((e: unknown) => e))).toBe(401);
    expect(tokens.active('id-1')).toBe(0);
  });
});
