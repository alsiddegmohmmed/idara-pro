import { Module } from "@nestjs/common";
import { EmailQueueModule } from "./email-queue.module";
import { MAILER } from "./mailer";
import { NodemailerMailer } from "./nodemailer-mailer";
import { SendEmailProcessor } from "./send-email.processor";

/** Worker-only (same rule as DocumentExpiryJobModule) — the only place Mailer.send() runs. */
@Module({
  imports: [EmailQueueModule],
  providers: [{ provide: MAILER, useClass: NodemailerMailer }, SendEmailProcessor],
})
export class SendEmailJobModule {}
