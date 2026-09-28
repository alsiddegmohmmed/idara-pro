import { Inject } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { EMAIL_QUEUE } from "./email-queue.service";
import { MAILER, type MailMessage, type Mailer } from "./mailer";

/** Worker-only. Throwing lets BullMQ retry with the backoff set at enqueue time. */
@Processor(EMAIL_QUEUE)
export class SendEmailProcessor extends WorkerHost {
  constructor(@Inject(MAILER) private readonly mailer: Mailer) {
    super();
  }

  async process(job: Job<MailMessage>): Promise<void> {
    await this.mailer.send(job.data);
  }
}
