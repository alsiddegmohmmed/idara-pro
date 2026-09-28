import { Module } from "@nestjs/common";
import { AuditModule } from "../audit";
import { AuthModule } from "../auth";
import { EmployeesModule } from "../employees";
import { CustodyService } from "./application/custody.service";
import { CUSTODY_REPOSITORY } from "./application/ports/custody-repository.port";
import { CustodyController } from "./http/custody.controller";
import { PrismaCustodyRepository } from "./infrastructure/prisma-custody.repository";

@Module({
  imports: [AuditModule, AuthModule, EmployeesModule],
  controllers: [CustodyController],
  providers: [CustodyService, { provide: CUSTODY_REPOSITORY, useClass: PrismaCustodyRepository }],
})
export class CustodyModule {}
