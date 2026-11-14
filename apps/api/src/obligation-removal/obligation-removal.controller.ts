import { Controller, Delete, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { type AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { ObligationRemovalService } from './obligation-removal.service.js';

@Controller('obligations')
export class ObligationRemovalController {
  constructor(private readonly removal: ObligationRemovalService) {}

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<void> {
    return this.removal.delete(user.id, id);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<void> {
    return this.removal.archive(user.id, id);
  }
}
