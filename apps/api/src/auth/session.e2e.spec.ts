import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ErrorCode, type SessionResponse } from '@nestmint/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashToken } from './session.service.js';

const DOMAIN = '@session-test.example';
const PASSWORD = 'correct-horse-battery';
const WEB_ORIGIN = 'http://localhost:5173';

// Needs a migrated PostgreSQL database (CI provides one). Skipped when DATABASE_URL is unset.
describe.skipIf(!process.env.DATABASE_URL)('login, refresh, logout and /me', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let counter = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** Registers a fresh user (a new email per test keeps tests independent). */
  async function newUser(): Promise<string> {
    const email = `user${++counter}-${Date.now()}${DOMAIN}`;
    await http().post('/api/v1/auth/register').send({ email, password: PASSWORD }).expect(201);
    return email;
  }

  async function login(email: string) {
    const response = await http().post('/api/v1/auth/login').send({ email, password: PASSWORD });
    return { response, cookie: refreshCookie(response) };
  }

  function refreshCookie(response: request.Response): string {
    const cookies = (response.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
    const cookie = cookies.find((c) => c.startsWith('nm_refresh='));
    if (!cookie) throw new Error('No refresh cookie in response');
    return cookie;
  }

  const cookieHeader = (setCookie: string) => setCookie.split(';')[0]!;

  it('logs in, returns a session and sets a locked-down refresh cookie', async () => {
    const email = await newUser();
    const { response, cookie } = await login(email);

    expect(response.status).toBe(200);
    const body = response.body as SessionResponse;
    expect(body.accessToken).toBeTruthy();
    expect(body.expiresIn).toBe(900);
    expect(body.user).toEqual({ id: expect.any(String), email, displayName: null });
    expect(JSON.stringify(body)).not.toContain('argon2');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/v1/auth');
    expect(cookie).toContain('SameSite=Strict');
  });

  it('stores only a hash of the refresh token', async () => {
    const { cookie } = await login(await newUser());
    const raw = cookieHeader(cookie).slice('nm_refresh='.length);

    const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(raw) } });
    expect(row).not.toBeNull();
    expect(await prisma.refreshToken.count({ where: { tokenHash: raw } })).toBe(0);
  });

  it('GET /me needs a valid access token', async () => {
    const email = await newUser();
    const { response } = await login(email);
    const token = (response.body as SessionResponse).accessToken;

    const me = await http().get('/api/v1/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(me.body).toEqual({ id: expect.any(String), email, displayName: null });

    const none = await http().get('/api/v1/me').expect(401);
    expect(none.body.error.code).toBe(ErrorCode.Unauthorized);
    await http().get('/api/v1/me').set('Authorization', 'Bearer garbage').expect(401);
  });

  it('keeps health public', async () => {
    await http().get('/api/v1/health').expect(200);
  });

  it('gives the same 401 for a wrong password and an unknown email', async () => {
    const email = await newUser();
    const wrongPassword = await http()
      .post('/api/v1/auth/login')
      .send({ email, password: 'not-the-password' })
      .expect(401);
    const unknownEmail = await http()
      .post('/api/v1/auth/login')
      .send({ email: `nobody${DOMAIN}`, password: 'not-the-password' })
      .expect(401);

    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error.code).toBe(ErrorCode.InvalidCredentials);
  });

  it('validates the login body', async () => {
    const response = await http().post('/api/v1/auth/login').send({}).expect(400);
    expect(response.body.error.code).toBe(ErrorCode.ValidationFailed);
  });

  it('blocks a client after 10 failed logins', async () => {
    const email = await newUser();
    for (let i = 0; i < 10; i++) {
      await http().post('/api/v1/auth/login').send({ email, password: 'wrong-password' });
    }
    const blocked = await http().post('/api/v1/auth/login').send({ email, password: PASSWORD });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe(ErrorCode.TooManyRequests);
  });

  it('refresh issues a new session and rotates the cookie', async () => {
    const { cookie } = await login(await newUser());

    const refreshed = await http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader(cookie))
      .expect(200);
    const token = (refreshed.body as SessionResponse).accessToken;

    expect(refreshCookie(refreshed)).not.toBe(cookie);
    await http().get('/api/v1/me').set('Authorization', `Bearer ${token}`).expect(200);
  });

  it('refresh without a cookie is rejected', async () => {
    const response = await http().post('/api/v1/auth/refresh').expect(401);
    expect(response.body.error.code).toBe(ErrorCode.Unauthorized);
  });

  it('replaying a rotated token revokes every session of the user', async () => {
    const email = await newUser();
    const { cookie: first } = await login(email);
    const second = await http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader(first))
      .expect(200);
    const newest = refreshCookie(second);

    // Pretend the rotation happened a minute ago, outside the concurrent-request grace window.
    const raw = cookieHeader(first).slice('nm_refresh='.length);
    await prisma.refreshToken.update({
      where: { tokenHash: hashToken(raw) },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });

    await http().post('/api/v1/auth/refresh').set('Cookie', cookieHeader(first)).expect(401);
    await http().post('/api/v1/auth/refresh').set('Cookie', cookieHeader(newest)).expect(401);
  });

  it('logout revokes the session and clears the cookie', async () => {
    const { cookie } = await login(await newUser());

    const out = await http()
      .post('/api/v1/auth/logout')
      .set('Cookie', cookieHeader(cookie))
      .expect(204);
    expect(refreshCookie(out)).toMatch(/nm_refresh=;/);

    await http().post('/api/v1/auth/refresh').set('Cookie', cookieHeader(cookie)).expect(401);
  });

  it('rejects refresh and logout from a foreign origin, accepts the web origin', async () => {
    const { cookie } = await login(await newUser());

    for (const path of ['refresh', 'logout']) {
      const blocked = await http()
        .post(`/api/v1/auth/${path}`)
        .set('Cookie', cookieHeader(cookie))
        .set('Origin', 'https://evil.example')
        .expect(403);
      expect(blocked.body.error.code).toBe(ErrorCode.Forbidden);
    }

    await http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader(cookie))
      .set('Origin', WEB_ORIGIN)
      .expect(200);
  });
});
