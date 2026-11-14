import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  BUDGET_IMPORT_MAX_BYTES,
  type BudgetImportPreviewResponse,
  ErrorCode,
} from '@nestmint/shared';
import { type AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ApiException } from '../common/api.exception.js';
import { Clock } from '../common/clock.js';
import { BudgetImportService } from './budget-import.service.js';

const invalid = (field: string, message: string) =>
  new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.ValidationFailed, 'Some fields are invalid.', {
    [field]: message,
  });

@Controller('imports/budget')
export class BudgetImportController {
  constructor(
    private readonly imports: BudgetImportService,
    private readonly clock: Clock,
  ) {}

  /** Multipart form: `file` (.xlsx, up to 5 MB) and optionally `year` (defaults to this year). */
  @Post('preview')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: BUDGET_IMPORT_MAX_BYTES } }))
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Body() body: { year?: string },
  ): Promise<BudgetImportPreviewResponse> {
    if (!file) throw invalid('file', 'Choose the .xlsx file to import');
    const year =
      body?.year === undefined || body.year === ''
        ? this.clock.now().getUTCFullYear()
        : Number(body.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw invalid('year', 'Enter a year between 2000 and 2100');
    }
    return this.imports.preview(user.id, file.buffer, year);
  }
}
