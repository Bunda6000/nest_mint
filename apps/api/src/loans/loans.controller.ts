import { Body, Controller, Param, Post } from '@nestjs/common';
import {
  type CreateRateChangeData,
  createRateChangeSchema,
  type ObligationResponse,
} from '@nestmint/shared';
import { type AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { LoansService } from './loans.service.js';

@Controller('obligations')
export class LoansController {
  constructor(private readonly loans: LoansService) {}

  @Post(':id/rate-changes')
  changeRate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe<CreateRateChangeData>(createRateChangeSchema))
    body: CreateRateChangeData,
  ): Promise<ObligationResponse> {
    return this.loans.changeRate(user.id, id, body);
  }
}
