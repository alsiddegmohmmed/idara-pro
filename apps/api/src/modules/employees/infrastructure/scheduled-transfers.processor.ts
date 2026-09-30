import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import { TransferEmployeeUseCase } from "../application/transfer-employee.use-case";

/** Worker-only (employee-assignments-job.module.ts): one company at a time, a failure never stops the rest. */
@Processor("scheduled-transfers")
export class ScheduledTransfersProcessor extends WorkerHost {
  private readonly logger = new Logger(ScheduledTransfersProcessor.name);

  constructor(
    private readonly transfers: TransferEmployeeUseCase,
    private readonly db: TenantDatabase,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    for (const companyId of await this.db.listCompanyIds()) {
      try {
        const applied = await this.transfers.applyDue(companyId);
        if (applied > 0) this.logger.log(`Applied ${applied} scheduled transfers (company ${companyId})`);
      } catch (error) {
        this.logger.error(`Scheduled transfers failed for company ${companyId}: ${String(error)}`);
      }
    }
  }
}
