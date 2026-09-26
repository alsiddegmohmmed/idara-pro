import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { TenantDatabase } from "./with-tenant";

@Global()
@Module({
  providers: [PrismaService, TenantDatabase],
  exports: [TenantDatabase],
})
export class DatabaseModule {}
