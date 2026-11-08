import type { INestApplication } from '@nestjs/common';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { allowedOrigins } from './common/origins.js';

/** Shared HTTP setup for the running app and API tests. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableCors({ origin: allowedOrigins(), credentials: true });
}
