import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  type CoachAnswerResponse,
  type CoachQuestionData,
  coachQuestionSchema,
} from '@nestmint/shared';
import { type AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CoachService } from './coach.service.js';

@Controller('coach')
export class CoachController {
  constructor(private readonly coach: CoachService) {}

  /** Nothing is saved; the answer is built from the user's own data only. */
  @Post('ask')
  @HttpCode(HttpStatus.OK)
  ask(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe<CoachQuestionData>(coachQuestionSchema)) body: CoachQuestionData,
  ): Promise<CoachAnswerResponse> {
    return this.coach.ask(user.id, body.question);
  }
}
