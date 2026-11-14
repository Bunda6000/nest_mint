import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
import { ErrorCode, type LedgerResponse } from '@nestmint/shared';
import { type AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ApiException } from '../common/api.exception.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { ObligationLedgerService } from './obligation-ledger.service.js';

/** `?year=2026`, a four-digit year from 2000 to 2100; left out means this year. */
function parseYearQuery(year: unknown): number | undefined {
  if (year === undefined) return undefined;
  const value = typeof year === 'string' && /^\d{4}$/.test(year) ? Number(year) : NaN;
  if (!(value >= 2000 && value <= 2100)) {
    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.ValidationFailed,
      'Some fields are invalid.',
      { year: 'Choose a year from 2000 to 2100' },
    );
  }
  return value;
}

@Controller('obligations')
export class ObligationLedgerController {
  constructor(private readonly ledger: ObligationLedgerService) {}

  @Get(':id/ledger')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParamPipe) id: string,
    @Query('year') year?: unknown,
  ): Promise<LedgerResponse> {
    return this.ledger.ledger(user.id, id, parseYearQuery(year));
  }
}
