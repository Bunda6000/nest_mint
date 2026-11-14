import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  type CreateLoanData,
  createLoanSchema,
  type CreateObligationData,
  createObligationSchema,
  type ObligationResponse,
  type ObligationsResponse,
  type UpdateObligationData,
  updateObligationSchema,
} from '@nestmint/shared';
import { type AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ObligationsService } from './obligations.service.js';

@Controller('obligations')
export class ObligationsController {
  constructor(private readonly obligations: ObligationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<ObligationsResponse> {
    return this.obligations.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe<CreateObligationData>(createObligationSchema))
    body: CreateObligationData,
  ): Promise<ObligationResponse> {
    return this.obligations.create(user.id, body);
  }

  @Post('loans')
  createLoan(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe<CreateLoanData>(createLoanSchema)) body: CreateLoanData,
  ): Promise<ObligationResponse> {
    return this.obligations.createLoan(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe<UpdateObligationData>(updateObligationSchema))
    body: UpdateObligationData,
  ): Promise<ObligationResponse> {
    return this.obligations.update(user.id, id, body);
  }
}
