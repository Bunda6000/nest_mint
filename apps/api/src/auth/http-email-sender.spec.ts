import { describe, expect, it, vi } from 'vitest';
import { HttpEmailSender, textToHtml } from './http-email-sender.js';

const config = { url: 'https://mail.example.test/send', token: 'secret-token' };
const message = {
  to: 'ana@example.com',
  subject: 'Reset',
  text: 'Hello\nthere\n\nOpen https://x.test/a?b=1',
};

describe('textToHtml', () => {
  it('escapes markup, makes links clickable and keeps paragraphs', () => {
    expect(textToHtml('a <b>\nc\n\nSee https://x.test/p')).toBe(
      '<p>a &lt;b&gt;<br>c</p><p>See <a href="https://x.test/p">https://x.test/p</a></p>',
    );
  });
});

describe('HttpEmailSender', () => {
  it('posts to the mail API with the bearer token', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await new HttpEmailSender(config, fetchFn as unknown as typeof fetch).send(message);

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(config.url);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
    const body = JSON.parse(init.body as string) as Record<string, string>;
    expect(body).toMatchObject({ to: 'ana@example.com', subject: 'Reset' });
    expect(body.html).toContain('<a href="https://x.test/a?b=1">');
  });

  it('does not throw when the API fails or is unreachable', async () => {
    const failing = vi.fn().mockResolvedValue({ ok: false, status: 502 });
    await expect(
      new HttpEmailSender(config, failing as unknown as typeof fetch).send(message),
    ).resolves.toBeUndefined();

    const down = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(
      new HttpEmailSender(config, down as unknown as typeof fetch).send(message),
    ).resolves.toBeUndefined();
  });
});
