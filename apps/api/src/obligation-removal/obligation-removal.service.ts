import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '@nestmint/shared';
import { BILLS_REPOSITORY, type BillsRepository } from '../bills/bills.repository.js';
import { ApiException } from '../common/api.exception.js';
import {
  OBLIGATIONS_REPOSITORY,
  type ObligationsRepository,
} from '../obligations/obligations.repository.js';

/**
 * Takes a bill or loan out of use. With no payments it is deleted for good. With payments it must
 * be archived instead, so the paid bills (and every total built from them) stay as they were.
 */
@Injectable()
export class ObligationRemovalService {
  private readonly logger = new Logger(ObligationRemovalService.name);

  constructor(
    @Inject(OBLIGATIONS_REPOSITORY) private readonly obligations: ObligationsRepository,
    @Inject(BILLS_REPOSITORY) private readonly bills: BillsRepository,
  ) {}

  /** 404 when there is none; 409 (with the number of payments) when it has payments. */
  async delete(userId: string, id: string): Promise<void> {
    await this.mustExist(userId, id);
    const paid = await this.bills.countPaidForObligation(userId, id);
    if (paid > 0) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        ErrorCode.Conflict,
        `It has ${paid} recorded ${paid === 1 ? 'payment' : 'payments'}, so it cannot be deleted. Archive it to keep them in your history.`,
        { paidBills: String(paid) },
      );
    }
    await this.bills.deleteUnpaidForObligation(userId, id);
    await this.obligations.remove(userId, id);
    this.logger.log(`Deleted obligation ${id}`);
  }

  /** Hides it, removes its unpaid bills and stops new ones. Paid bills stay. */
  async archive(userId: string, id: string): Promise<void> {
    await this.mustExist(userId, id);
    await this.bills.deleteUnpaidForObligation(userId, id);
    await this.obligations.archive(userId, id);
    this.logger.log(`Archived obligation ${id}`);
  }

  private async mustExist(userId: string, id: string): Promise<void> {
    if (!(await this.obligations.find(userId, id))) {
      throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.NotFound, 'Obligation not found.');
    }
  }
}
