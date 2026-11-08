import { Controller, Get } from '@nestjs/common';
import type { UserResponse } from '@nestmint/shared';
import { AuthService } from './auth.service.js';
import { type AuthenticatedUser, CurrentUser } from './current-user.decorator.js';

@Controller('me')
export class MeController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserResponse> {
    return this.auth.getProfile(user.id);
  }
}
