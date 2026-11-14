import { beforeEach, describe, expect, it } from 'vitest';
import { FakeClock, InMemoryRefreshTokens, InMemoryUsers } from '../testing/fakes.js';
import { AccessTokenService } from './access-token.service.js';
import { loadAuthConfig } from './auth.config.js';
import type { EmailMessage, EmailSender } from './email-sender.js';
import { LoginRateLimiter } from './login-rate-limiter.js';
import { PasswordHasher } from './password-hasher.js';
import type {
  PasswordResetTokenRecord,
  PasswordResetTokensRepository,
} from './password-reset-tokens.repository.js';
import { PasswordResetService, RESET_TTL_MS } from './password-reset.service.js';
import { SessionService } from './session.service.js';

const config = loadAuthConfig({ JWT_SECRET: 'x'.repeat(40), WEB_ORIGIN: 'https://app.test' });

class InMemoryResetTokens implements PasswordResetTokensRepository {
  rows: (PasswordResetTokenRecord & { tokenHash: string })[] = [];
  async create(t: { userId: string; tokenHash: string; expiresAt: Date }) {
    this.rows.push({ id: `p-${this.rows.length + 1}`, usedAt: null, ...t });
  }
  async findByHash(h: string) {
    return this.rows.find((r) => r.tokenHash === h) ?? null;
  }
  async markUsed(id: string, at: Date) {
    const row = this.rows.find((r) => r.id === id)!;
    if (row.usedAt) return false;
    row.usedAt = at;
    return true;
  }
  async invalidateAllForUser(userId: string, at: Date) {
    for (const r of this.rows) if (r.userId === userId && !r.usedAt) r.usedAt = at;
  }
}

const codeOf = async (promise: Promise<unknown>): Promise<string | undefined> =>
  promise.then(
    () => undefined,
    (e: { getResponse?: () => { error: { code: string } } }) => e.getResponse?.().error.code,
  );

describe('PasswordResetService', () => {
  let users: InMemoryUsers;
  let refresh: InMemoryRefreshTokens;
  let resets: InMemoryResetTokens;
  let clock: FakeClock;
  let sent: EmailMessage[];
  let service: PasswordResetService;
  const hasher = new PasswordHasher();

  beforeEach(async () => {
    users = new InMemoryUsers();
    refresh = new InMemoryRefreshTokens();
    resets = new InMemoryResetTokens();
    clock = new FakeClock();
    sent = [];
    const email: EmailSender = { send: async (m) => void sent.push(m) };
    const sessions = new SessionService(
      refresh,
      users,
      new AccessTokenService(config, clock),
      config,
      clock,
    );
    service = new PasswordResetService(
      users,
      resets,
      email,
      hasher,
      sessions,
      new LoginRateLimiter(clock),
      config,
      clock,
    );
    await users.create({
      email: 'filip@example.com',
      passwordHash: await hasher.hash('old-password-1'),
    });
  });

  const tokenFromEmail = () => /token=([\w-]+)/.exec(sent[0]!.text)![1]!;

  it('emails a link for a known address and stores only a hash', async () => {
    await service.request('filip@example.com', '1.1.1.1');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain('https://app.test/reset-password?token=');
    expect(JSON.stringify(resets.rows)).not.toContain(tokenFromEmail());
  });

  it('does nothing visible for an unknown address', async () => {
    await service.request('nobody@example.com', '1.1.1.1');
    expect(sent).toHaveLength(0);
    expect(resets.rows).toHaveLength(0);
  });

  it('sets the password once, and ends every session', async () => {
    const user = users.rows[0]!;
    await new SessionService(
      refresh,
      users,
      new AccessTokenService(config, clock),
      config,
      clock,
    ).start(user);
    await service.request('filip@example.com', '1.1.1.1');
    const token = tokenFromEmail();

    await service.confirm(token, 'brand-new-password');
    expect(await hasher.verify(users.rows[0]!.passwordHash, 'brand-new-password')).toBe(true);
    expect(refresh.active('id-1')).toBe(0);
    expect(await codeOf(service.confirm(token, 'another-password-2'))).toBe('VALIDATION_FAILED');
  });

  it('rejects an expired or unknown link', async () => {
    await service.request('filip@example.com', '1.1.1.1');
    const token = tokenFromEmail();
    clock.advance(RESET_TTL_MS + 1000);
    expect(await codeOf(service.confirm(token, 'brand-new-password'))).toBe('VALIDATION_FAILED');
    expect(await codeOf(service.confirm('x'.repeat(43), 'brand-new-password'))).toBe(
      'VALIDATION_FAILED',
    );
  });

  it('limits how often one address can be asked about', async () => {
    for (let i = 0; i < 10; i++) await service.request('filip@example.com', '1.1.1.1');
    expect(await codeOf(service.request('filip@example.com', '1.1.1.1'))).toBe('TOO_MANY_REQUESTS');
  });
});
