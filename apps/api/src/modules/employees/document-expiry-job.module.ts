import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QueueModule } from "../../shared/queue/queue.module";
import { EmployeesModule } from "./employees.module";
import { DocumentExpiryProcessor } from "./infrastructure/document-expiry.processor";

/**
 * Worker-only (docs/adr/0006-document-expiry-job.md) — the HTTP AppModule
 * never imports this, so the API process never registers a BullMQ
 * queue/processor and the job can only ever run in the worker process.
 */
@Module({
  imports: [QueueModule, EmployeesModule, BullModule.registerQueue({ name: "document-expiry" })],
  providers: [DocumentExpiryProcessor],
  exports: [BullModule],
})
export class DocumentExpiryJobModule {}
