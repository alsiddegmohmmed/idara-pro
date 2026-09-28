import { Global, Module, type OnApplicationShutdown, Inject } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import Redis from "ioredis";
import { ConfigService } from "../config/config.service";
import { REDIS_CLIENT } from "./redis-client";

/**
 * Redis/BullMQ infrastructure (docs/adr/0006, amended by docs/adr/0008). Both
 * processes import this now: the worker to *consume* jobs, the HTTP API to
 * *produce* them (email) and to rate-limit. The API still never registers a
 * WorkerHost/processor — that stays in the worker-only *JobModule files.
 * BullModule.forRootAsync() is global on its own (same pattern as EventsModule).
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
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      // Plain client for request-path use (rate limiting): bounded retries so a
      // Redis outage fails the request instead of hanging it.
      useFactory: (config: ConfigService) => new Redis(config.env.REDIS_URL, { maxRetriesPerRequest: 2 }),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class QueueModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    this.redis.disconnect();
  }
}
