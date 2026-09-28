import { Injectable } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";
import { ConfigService } from "../config/config.service";
import type { MailMessage, Mailer } from "./mailer";

@Injectable()
export class NodemailerMailer implements Mailer {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = config.env;
    this.from = SMTP_FROM;
    this.transporter = createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      // With credentials, never fall back to plaintext if STARTTLS is stripped (dev Mailpit has none).
      requireTLS: SMTP_USER !== "" && SMTP_PORT !== 465,
      // Mailpit (dev) needs no auth; real SMTP sets both.
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}
