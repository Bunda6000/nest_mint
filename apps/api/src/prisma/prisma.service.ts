import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }
    // Serverless: every warm instance holds its own pool, and the hosted database
    // (Supabase pooler) only allows a few clients in total. Keep each pool small and
    // let idle connections go quickly so many instances do not exhaust the limit.
    const max = Number(process.env.DATABASE_POOL_MAX ?? 2);
    super({
      adapter: new PrismaPg({
        connectionString,
        max: Number.isInteger(max) && max > 0 ? max : 2,
        idleTimeoutMillis: 5_000,
        connectionTimeoutMillis: 10_000,
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
