import { AuditLogQueryService } from "./application/audit-log-query.service";
import { AuditController } from "./http/audit.controller";
import { Module } from "@nestjs/common";
import { AuditService } from "./application/audit.service";
import { AuditRepository } from "./infrastructure/audit.repository";

@Module({
  controllers: [AuditController],
  providers: [AuditRepository, AuditService, AuditLogQueryService],
  exports: [AuditService],
})
export class AuditModule {}
