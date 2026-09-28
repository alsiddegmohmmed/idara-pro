import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { TenantDatabase } from "../database/with-tenant";
import type { MailMessage } from "./mailer";

export const EMAIL_QUEUE = "email";

/**
 * Producer side only — the HTTP API enqueues, the worker's SendEmailProcessor
 * actually sends (docs/adr/0008-email-and-self-service.md). Message content is
 * rendered before enqueueing so the processor stays dumb: "send this exact email".
 */
@Injectable()
export class EmailQueueService {
  constructor(
    @InjectQueue(EMAIL_QUEUE) private readonly queue: Queue,
    private readonly db: TenantDatabase,
  ) {}

  /**
   * Inside a use-case transaction (TenantDatabase.transaction) the job is only queued after that
   * transaction commits — a rolled-back request never sends anything, and the email can never
   * arrive before the data it refers to exists. Outside one it is queued immediately (and a queue
   * failure throws); after a commit, a queue failure is logged, not thrown, since the data is saved.
   */
  async enqueue(message: MailMessage): Promise<void> {
    await this.db.afterCommit(() => this.add(message));
  }

  private async add(message: MailMessage): Promise<void> {
    // Queueing is one Redis call; retry a couple of times so a blip right after a commit doesn't lose the email.
    for (let attempt = 1; ; attempt += 1) {
      try {
        await this.push(message);
        return;
      } catch (error) {
        if (attempt >= 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
      }
    }
  }

  private async push(message: MailMessage): Promise<void> {
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
