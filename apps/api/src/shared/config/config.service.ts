import { Injectable } from "@nestjs/common";
import { envSchema, type Env } from "./env.schema";

@Injectable()
export class ConfigService {
  readonly env: Env;

  constructor() {
    // Validated once at startup, per AGENTS.md §3 rule 8 — crash fast on bad env.
    this.env = envSchema.parse();
  }
}
