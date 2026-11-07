import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from '../app.setup.js';

@Controller('boom')
class BoomController {
  @Get()
  boom(): never {
    throw new Error('secret internal detail');
  }
}

describe('ApiExceptionFilter', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [BoomController] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('renders unknown routes in the standard error shape', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/nope').expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('hides internal error details from the client', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/boom').expect(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    });
  });
});
