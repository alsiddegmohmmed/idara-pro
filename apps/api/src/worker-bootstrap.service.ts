import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { ConfigService } from "./shared/config/config.service";

/** 00:02 Riyadh time: early enough that the day's first check-in already counts for the new branch. */
const SCHEDULED_TRANSFERS_CRON = "2 0 * * *";

/** docs/adr/0006-document-expiry-job.md. Registers the repeatable schedule
 * once at worker startup. */
@Injectable()
export class WorkerBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WorkerBootstrapService.name);

  constructor(
    @InjectQueue("document-expiry") private readonly documentExpiryQueue: Queue,
    @InjectQueue("attendance-close") private readonly attendanceCloseQueue: Queue,
    @InjectQueue("scheduled-transfers") private readonly scheduledTransfersQueue: Queue,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // upsertJobScheduler is a true upsert keyed by scheduler id — restarting
    // the worker, or later changing DOCUMENT_EXPIRY_CRON, updates this same
    // schedule in place rather than creating a duplicate/stale one the way
    // the older repeat+fixed-jobId option could.
    await this.documentExpiryQueue.upsertJobScheduler(
      "document-expiry-daily",
      { pattern: this.config.env.DOCUMENT_EXPIRY_CRON, tz: "Asia/Riyadh" },
      { name: "check", data: {} },
    );
    this.logger.log(`Document expiry job scheduled: "${this.config.env.DOCUMENT_EXPIRY_CRON}" Asia/Riyadh`);
    // Closes yesterday's attendance (absent / missing check-out) shortly after midnight Riyadh time.
    await this.attendanceCloseQueue.upsertJobScheduler(
      "attendance-close-daily",
      { pattern: this.config.env.ATTENDANCE_CLOSE_CRON, tz: "Asia/Riyadh" },
      { name: "close", data: {} },
    );
    this.logger.log(`Attendance close job scheduled: "${this.config.env.ATTENDANCE_CLOSE_CRON}" Asia/Riyadh`);
    // Future-dated transfers take effect at the start of their day (ADR-0012), before anyone checks in.
    await this.scheduledTransfersQueue.upsertJobScheduler(
      "scheduled-transfers-daily",
      { pattern: SCHEDULED_TRANSFERS_CRON, tz: "Asia/Riyadh" },
      { name: "apply", data: {} },
    );
    this.logger.log(`Scheduled transfers job: "${SCHEDULED_TRANSFERS_CRON}" Asia/Riyadh`);
  }
}
