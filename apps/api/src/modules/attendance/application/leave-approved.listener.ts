import { Inject, Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import { ATTENDANCE_REPOSITORY, type AttendanceRepositoryPort } from "./ports/attendance-repository.port";

/** Event shape as this module understands it — not imported from leave (no import either way). */
interface LeaveApprovedEvent {
  companyId: string;
  employeeId: string;
  /** The request's branch snapshot — new leave days belong to the branch the leave was filed in. */
  branchId: string | null;
  dates: string[];
}

/**
 * business-rules.md "Leave": on approval, in ONE transaction, attendance days in the range become
 * `leave`. Runs inside the approval transaction (suppressErrors: false) — if this fails, nothing is
 * approved. A day HR already corrected keeps its correction.
 */
@Injectable()
export class LeaveApprovedListener {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY) private readonly repository: AttendanceRepositoryPort,
    private readonly db: TenantDatabase,
  ) {}

  @OnEvent("leave.approved", { suppressErrors: false })
  async onLeaveApproved(event: LeaveApprovedEvent): Promise<void> {
    this.db.assertInTransaction();
    for (const date of event.dates) {
      const day = await this.repository.lockOrCreateDay(event.companyId, { id: event.employeeId, branchId: event.branchId }, new Date(`${date}T00:00:00.000Z`));
      if (day.corrected) continue;
      await this.repository.updateDay(event.companyId, day.id, {
        status: "leave",
        firstInAt: day.firstInAt,
        lastOutAt: day.lastOutAt,
        lateMin: 0,
        workedMin: day.workedMin,
        missingCheckout: false,
      });
    }
  }
}
