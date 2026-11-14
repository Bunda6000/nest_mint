import { Module } from '@nestjs/common';
import { EXCHANGE_RATES_REPOSITORY } from './exchange-rates.repository.js';
import { ExchangeRatesController } from './exchange-rates.controller.js';
import { ExchangeRatesService } from './exchange-rates.service.js';
import { PrismaExchangeRatesRepository } from './prisma-exchange-rates.repository.js';

@Module({
  controllers: [ExchangeRatesController],
  providers: [
    ExchangeRatesService,
    { provide: EXCHANGE_RATES_REPOSITORY, useClass: PrismaExchangeRatesRepository },
  ],
})
export class ExchangeRatesModule {}
