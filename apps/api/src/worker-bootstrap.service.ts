import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { ConfigService } from "./shared/config/config.service";

/** docs/adr/0006-document-expiry-job.md. Registers the repeatable schedule
 * once at worker startup. */
@Injectable()
export class WorkerBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WorkerBootstrapService.name);

  constructor(
    @InjectQueue("document-expiry") private readonly documentExpiryQueue: Queue,
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
  }
}
