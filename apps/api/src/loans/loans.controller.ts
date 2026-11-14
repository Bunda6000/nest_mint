import { Body, Controller, Param, Post } from '@nestjs/common';
import {
  type CreateExtraPaymentData,
  createExtraPaymentSchema,
  type CreateRateChangeData,
  createRateChangeSchema,
  type ObligationResponse,
  type PayOffLoanData,
  payOffLoanSchema,
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

  @Post(':id/extra-payments')
  addExtraPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe<CreateExtraPaymentData>(createExtraPaymentSchema))
    body: CreateExtraPaymentData,
  ): Promise<ObligationResponse> {
    return this.loans.addExtraPayment(user.id, id, body);
  }

  @Post(':id/payoff')
  payOff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe<PayOffLoanData>(payOffLoanSchema)) body: PayOffLoanData,
  ): Promise<ObligationResponse> {
    return this.loans.payOff(user.id, id, body);
  }
}
