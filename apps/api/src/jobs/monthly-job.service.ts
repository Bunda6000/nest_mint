import { Inject, Injectable, Logger } from '@nestjs/common';
import { BillsService } from '../bills/bills.service.js';
import { USERS_REPOSITORY, type UsersRepository } from '../users/users.repository.js';

export interface MonthlyJobResult {
  users: number;
  billsCreated: number;
  /** Users whose run failed; the others were not affected. */
  failed: number;
}

@Injectable()
export class MonthlyJobService {
  private readonly logger = new Logger(MonthlyJobService.name);

  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    private readonly bills: BillsService,
  ) {}

  /**
   * Catches every user's bills up to next month (NM-20). It is the same catch-up the Bills screen
   * runs, so repeating it, or running it alongside a user, never creates a second bill for a period
   * (the database has a unique key on obligation and month).
   */
  async run(): Promise<MonthlyJobResult> {
    const ids = await this.users.listIds();
    let billsCreated = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        billsCreated += (await this.bills.sync(id)).created;
      } catch (error) {
        failed += 1;
        this.logger.error(`Monthly job failed for a user: ${(error as Error).message}`);
      }
    }
    this.logger.log(
      `Monthly job: ${ids.length} users, ${billsCreated} bills created, ${failed} failed`,
    );
    return { users: ids.length, billsCreated, failed };
  }
}
