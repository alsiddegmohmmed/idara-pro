import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "../../../shared/config/config.service";

@Controller()
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Get("health")
  health(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("ready")
  ready(): { status: "ok" } {
    // No DB check yet — Prisma isn't wired up until Stage 3. Confirms config parsed.
    void this.config.env;
    return { status: "ok" };
  }
}
