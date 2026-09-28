export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Port — the only thing application code knows about sending mail. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export const MAILER = Symbol("MAILER");
