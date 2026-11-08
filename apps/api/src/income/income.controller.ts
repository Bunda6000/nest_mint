import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  type CreateIncomeData,
  createIncomeSchema,
  type IncomeResponse,
  type IncomesResponse,
  type UpdateIncomeData,
  updateIncomeSchema,
} from '@nestmint/shared';
import { type AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { IncomeService } from './income.service.js';

@Controller('income')
export class IncomeController {
  constructor(private readonly income: IncomeService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<IncomesResponse> {
    return this.income.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe<CreateIncomeData>(createIncomeSchema)) body: CreateIncomeData,
  ): Promise<IncomeResponse> {
    return this.income.create(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe<UpdateIncomeData>(updateIncomeSchema)) body: UpdateIncomeData,
  ): Promise<IncomeResponse> {
    return this.income.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<void> {
    return this.income.delete(user.id, id);
  }
}
