import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QueueModule } from "../../shared/queue/queue.module";
import { EmployeesModule } from "./employees.module";
import { ScheduledTransfersProcessor } from "./infrastructure/scheduled-transfers.processor";

/** Worker-only: applies future-dated transfers on their effective date (ADR-0012). */
@Module({
  imports: [QueueModule, EmployeesModule, BullModule.registerQueue({ name: "scheduled-transfers" })],
  providers: [ScheduledTransfersProcessor],
  exports: [BullModule],
})
export class EmployeeAssignmentsJobModule {}
