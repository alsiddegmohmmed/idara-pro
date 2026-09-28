import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QueueModule } from "../queue/queue.module";
import { EMAIL_QUEUE, EmailQueueService } from "./email-queue.service";

/** Imported by whoever needs to *send* an email (enqueue) — never runs a processor. */
@Module({
  imports: [QueueModule, BullModule.registerQueue({ name: EMAIL_QUEUE })],
  providers: [EmailQueueService],
  exports: [EmailQueueService, BullModule],
})
export class EmailQueueModule {}
