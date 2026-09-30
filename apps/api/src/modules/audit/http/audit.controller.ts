import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuditQuerySchema, PERMISSIONS, type AuditPage, type AuditQuery } from "@idara-pro/shared";
import { AccessPolicy } from "../../../shared/access/access-policy.service";
import { ForbiddenError } from "../../../shared/errors/errors";
import { CurrentUser } from "../../../shared/tenancy/current-user.decorator";
import { JwtAuthGuard } from "../../../shared/tenancy/jwt-auth.guard";
import { PermissionsGuard } from "../../../shared/tenancy/permissions.guard";
import { RequirePermission } from "../../../shared/tenancy/require-permission.decorator";
import type { AuthenticatedUser } from "../../../shared/tenancy/authenticated-user";
import { ZodValidationPipe } from "../../../shared/validation/zod-validation.pipe";
import { AuditLogQueryService } from "../application/audit-log-query.service";

@Controller("api/v1/audit")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditController {
  constructor(
    private readonly audit: AuditLogQueryService,
    private readonly policy: AccessPolicy,
  ) {}

  /** The log holds before/after snapshots of every branch's data, so it needs company-wide audit:read. */
  @Get()
  @RequirePermission(PERMISSIONS.AUDIT_READ)
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(AuditQuerySchema)) q: AuditQuery): Promise<AuditPage> {
    if (!this.policy.scopeFor(user.access, PERMISSIONS.AUDIT_READ)?.all) {
      throw new ForbiddenError("The audit log needs company-wide access", "audit.company_reach_required");
    }
    return this.audit.list(user.companyId, q);
  }
}
