import { Global, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import Redis from "ioredis";
import { ConfigService } from "../config/config.service";

/**
 * The worker process's only Redis/BullMQ dependency (docs/adr/0006) — the
 * HTTP AppModule never imports this, so the API process never touches Redis.
 * BullModule.forRootAsync() is global on its own (same pattern as
 * EventsModule wrapping EventEmitterModule.forRoot()); ConfigService is
 * already global too (ConfigModule), so no need to re-import it here.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // BullMQ's Worker requires this at connection construction time, not
        // just per-call (https://docs.bullmq.io/guide/going-to-production).
        connection: new Redis(config.env.REDIS_URL, { maxRetriesPerRequest: null }),
      }),
    }),
  ],
})
export class QueueModule {}
