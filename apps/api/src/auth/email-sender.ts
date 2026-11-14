import { Injectable, Logger } from '@nestjs/common';

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/** The one place the app sends email from. A real provider (Resend, SES…) is a new class here. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Stand-in until an email provider is chosen: writes to the log, never to a mailbox. The body is
 * logged only outside production, because it holds a link that signs the reader into a password
 * change (ADR-036).
 */
@Injectable()
export class LogEmailSender implements EmailSender {
  private readonly logger = new Logger(LogEmailSender.name);

  async send(message: EmailMessage): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      this.logger.warn(`Email "${message.subject}" not sent: no email provider is configured`);
      return;
    }
    this.logger.log(`Email to ${message.to}: ${message.subject}\n${message.text}`);
  }
}
