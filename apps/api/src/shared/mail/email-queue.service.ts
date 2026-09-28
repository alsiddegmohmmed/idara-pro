import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import type { MailMessage } from "./mailer";

export const EMAIL_QUEUE = "email";

/**
 * Producer side only — the HTTP API enqueues, the worker's SendEmailProcessor
 * actually sends (docs/adr/0008-email-and-self-service.md). Message content is
 * rendered before enqueueing so the processor stays dumb: "send this exact email".
 */
@Injectable()
export class EmailQueueService {
  constructor(@InjectQueue(EMAIL_QUEUE) private readonly queue: Queue) {}

  async enqueue(message: MailMessage): Promise<void> {
    await this.queue.add("send", message, {
      // ~20 minutes of retries (10s, 20s, ... 640s) rides out a short SMTP outage.
      attempts: 8,
      backoff: { type: "exponential", delay: 10_000 },
      // The job data is the rendered email, i.e. a live invitation/reset link — don't keep it in Redis.
      removeOnComplete: true,
      removeOnFail: { age: 3600 },
    });
  }
}
