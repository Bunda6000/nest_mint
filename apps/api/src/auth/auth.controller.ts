import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { type RegisterData, registerSchema, type UserResponse } from '@nestmint/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(
    @Body(new ZodValidationPipe<RegisterData>(registerSchema)) body: RegisterData,
  ): Promise<UserResponse> {
    return this.auth.register(body);
  }
}
