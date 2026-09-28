import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QueueModule } from "../../shared/queue/queue.module";
import { AttendanceModule } from "./attendance.module";
import { AttendanceCloseProcessor } from "./infrastructure/attendance-close.processor";

/** Worker-only, like DocumentExpiryJobModule: the HTTP AppModule never imports this. */
@Module({
  imports: [QueueModule, AttendanceModule, BullModule.registerQueue({ name: "attendance-close" })],
  providers: [AttendanceCloseProcessor],
  exports: [BullModule],
})
export class AttendanceCloseJobModule {}
