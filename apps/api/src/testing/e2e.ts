import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { SessionResponse } from '@nestmint/shared';
import request from 'supertest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface E2eUser {
  id: string;
  token: string;
}

const PASSWORD = 'correct-horse-battery';

/**
 * Starts the real app on the test database and creates users on demand, so every endpoint that
 * returns or changes user data can be tested with two users (see docs/adr/006-user-data-isolation.md).
 * Every user gets an email ending in `domain`; stop() deletes them, with all their data.
 *
 *   const e2e = new E2eHarness('@my-feature-test.example');
 *   beforeAll(() => e2e.start()); afterAll(() => e2e.stop());
 */
export class E2eHarness {
  app!: INestApplication;
  prisma!: PrismaService;
  private counter = 0;

  constructor(private readonly domain: string) {}

  async start(): Promise<void> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    this.app = moduleRef.createNestApplication();
    configureApp(this.app);
    await this.app.init();
    this.prisma = this.app.get(PrismaService);
  }

  async stop(): Promise<void> {
    await this.prisma.user.deleteMany({ where: { email: { endsWith: this.domain } } });
    await this.app.close();
  }

  http() {
    return request(this.app.getHttpServer());
  }

  /** Registers and logs in a fresh user. */
  async newUser(): Promise<E2eUser> {
    const email = `user${++this.counter}-${Date.now()}${this.domain}`;
    await this.http().post('/api/v1/auth/register').send({ email, password: PASSWORD }).expect(201);
    const login = await this.http().post('/api/v1/auth/login').send({ email, password: PASSWORD });
    const session = login.body as SessionResponse;
    return { id: session.user.id, token: session.accessToken };
  }

  get(path: string, user: E2eUser) {
    return this.http().get(`/api/v1${path}`).set('Authorization', `Bearer ${user.token}`);
  }
  post(path: string, user: E2eUser, body: unknown) {
    return this.http()
      .post(`/api/v1${path}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send(body as object);
  }
  patch(path: string, user: E2eUser, body: unknown) {
    return this.http()
      .patch(`/api/v1${path}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send(body as object);
  }
  put(path: string, user: E2eUser, body: unknown) {
    return this.http()
      .put(`/api/v1${path}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send(body as object);
  }
  delete(path: string, user: E2eUser) {
    return this.http().delete(`/api/v1${path}`).set('Authorization', `Bearer ${user.token}`);
  }
}
