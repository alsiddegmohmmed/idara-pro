import { Injectable } from "@nestjs/common";
import type { Invitation } from "@prisma/client";
import { AuditService } from "../../audit";
import { InvitationsService } from "../../auth";
import { assertCanInviteEmployee } from "../domain/employee-rules";
import { EmployeesService } from "./employees.service";

@Injectable()
export class InviteEmployeeUseCase {
  constructor(
    private readonly employees: EmployeesService,
    private readonly invitations: InvitationsService,
    private readonly audit: AuditService,
  ) {}

  async execute(
    companyId: string,
    actorId: string,
    employeeId: string,
    email: string,
    ip: string | null,
  ): Promise<Invitation> {
    const employee = await this.employees.findById(companyId, employeeId);
    assertCanInviteEmployee(employee.status, employee.userId);

    const invitation = await this.invitations.createForEmployee(companyId, actorId, employeeId, email, employee.fullNameAr);

    await this.audit.record(companyId, {
      actorId,
      action: "invite",
      entity: "employees",
      entityId: employeeId,
      after: { email },
      ip,
    });

    return invitation;
  }
}
