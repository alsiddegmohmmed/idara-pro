import { Module } from "@nestjs/common";
import { QueueModule } from "../queue/queue.module";
import { RateLimiter } from "./rate-limiter.service";

@Module({ imports: [QueueModule], providers: [RateLimiter], exports: [RateLimiter] })
export class RateLimitModule {}
