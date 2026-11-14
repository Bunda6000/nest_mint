import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  type CreateInstallmentData,
  createInstallmentSchema,
  type CreateLoanData,
  type CreateObligationGroupData,
  createObligationGroupSchema,
  createLoanSchema,
  type CreateObligationData,
  createObligationSchema,
  type ObligationGroupResponse,
  type ObligationResponse,
  type ObligationsResponse,
  type UpdateObligationData,
  type UpdateObligationGroupData,
  updateObligationGroupSchema,
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

  @Post('installments')
  createInstallment(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe<CreateInstallmentData>(createInstallmentSchema))
    body: CreateInstallmentData,
  ): Promise<ObligationResponse> {
    return this.obligations.createInstallment(user.id, body);
  }

  @Post('groups')
  createGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe<CreateObligationGroupData>(createObligationGroupSchema))
    body: CreateObligationGroupData,
  ): Promise<ObligationGroupResponse> {
    return this.obligations.createGroup(user.id, body);
  }

  @Patch('groups/:id')
  renameGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe<UpdateObligationGroupData>(updateObligationGroupSchema))
    body: UpdateObligationGroupData,
  ): Promise<ObligationGroupResponse> {
    return this.obligations.renameGroup(user.id, id, body);
  }

  @Delete('groups/:id')
  @HttpCode(204)
  removeGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<void> {
    return this.obligations.removeGroup(user.id, id);
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
