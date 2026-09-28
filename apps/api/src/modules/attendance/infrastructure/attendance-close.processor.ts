import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { CloseAttendanceDaysUseCase } from "../application/close-attendance-days.use-case";

/** Worker-only: closes yesterday's attendance for every company (absent / missing check-out). */
@Processor("attendance-close")
export class AttendanceCloseProcessor extends WorkerHost {
  constructor(private readonly closeDays: CloseAttendanceDaysUseCase) {
    super();
  }

  async process(_job: Job): Promise<void> {
    await this.closeDays.runForAllCompanies();
  }
}
