import { Injectable, Logger } from '@nestjs/common';
import type { EmailMessage, EmailSender } from './email-sender.js';

export interface HttpEmailConfig {
  /** Full address of the mail endpoint, e.g. https://barmenu.pro/api/mail.php */
  url: string;
  /** Sent as a Bearer token. Comes from the environment, never from the code. */
  token: string;
}

const escapeHtml = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** Plain text to simple HTML: escaped, links clickable, one paragraph per blank-line block. */
export function textToHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      const safe = escapeHtml(block).replace(
        /https?:\/\/[^\s<]+/g,
        (url) => `<a href="${url}">${url}</a>`,
      );
      return `<p>${safe.replaceAll('\n', '<br>')}</p>`;
    })
    .join('');
}

/**
 * Sends email through the owner's own mail API (POST JSON {to, subject, html}, Bearer token).
 * A failed send is logged, not thrown: the password-reset request must answer the same whether or
 * not the address exists, so a delivery problem must not show up as an error to the caller.
 */
@Injectable()
export class HttpEmailSender implements EmailSender {
  private readonly logger = new Logger(HttpEmailSender.name);

  constructor(
    private readonly config: HttpEmailConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    try {
      const response = await this.fetchFn(this.config.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: message.to,
          subject: message.subject,
          html: textToHtml(message.text),
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        this.logger.error(
          `Email "${message.subject}" not sent: mail API answered ${response.status}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Email "${message.subject}" not sent: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
