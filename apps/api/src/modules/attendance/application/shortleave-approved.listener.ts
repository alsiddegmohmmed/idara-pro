import { Inject, Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { TenantDatabase } from "../../../shared/database/with-tenant";
import { ATTENDANCE_REPOSITORY, type AttendanceRepositoryPort } from "./ports/attendance-repository.port";

/** Event shape as this module understands it — not imported from discipline (no import either way). */
interface ShortLeaveApprovedEvent {
  companyId: string;
  employeeId: string;
  branchId: string | null;
  /** YYYY-MM-DD */
  date: string;
  kind: string;
  minutes: number;
}

/**
 * business-rules.md "Short permissions": an approved late arrival excuses that much lateness on the day.
 * Runs inside the approval transaction (suppressErrors: false). A day HR corrected keeps its figures,
 * but the excuse is still recorded for later recalculation.
 */
@Injectable()
export class ShortLeaveApprovedListener {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY) private readonly repository: AttendanceRepositoryPort,
    private readonly db: TenantDatabase,
  ) {}

  @OnEvent("shortleave.approved", { suppressErrors: false })
  async onApproved(event: ShortLeaveApprovedEvent): Promise<void> {
    this.db.assertInTransaction();
    if (event.kind !== "late_arrival") return; // early leave / mid-day aren't measured by attendance yet
    const day = await this.repository.lockOrCreateDay(event.companyId, { id: event.employeeId, branchId: event.branchId }, new Date(`${event.date}T00:00:00.000Z`));
    const lateMin = day.corrected ? day.lateMin : Math.max(0, day.lateMin - event.minutes);
    const status = !day.corrected && day.status === "late" && lateMin === 0 ? "present" : day.status;
    await this.repository.setExcuse(event.companyId, day.id, { excusedMin: day.excusedMin + event.minutes, lateMin, status });
  }
}
