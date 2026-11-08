import { describe, expect, it } from 'vitest';
import { loadAuthConfig } from './auth.config.js';

describe('loadAuthConfig', () => {
  it('refuses to start without a long enough JWT_SECRET', () => {
    expect(() => loadAuthConfig({})).toThrow('JWT_SECRET');
    expect(() => loadAuthConfig({ JWT_SECRET: 'short' })).toThrow('JWT_SECRET');
  });

  it('refuses the example secret in production only', () => {
    const example = 'change-me-to-a-random-string-of-at-least-32-characters';
    expect(() => loadAuthConfig({ JWT_SECRET: example, NODE_ENV: 'production' })).toThrow(
      'example',
    );
    expect(loadAuthConfig({ JWT_SECRET: example }).cookieSecure).toBe(false);
  });

  it('uses secure cookies in production and reads the allowed origins', () => {
    const config = loadAuthConfig({
      JWT_SECRET: 'x'.repeat(40),
      NODE_ENV: 'production',
      WEB_ORIGIN: 'https://a.test, https://b.test',
    });
    expect(config.cookieSecure).toBe(true);
    expect(config.allowedOrigins).toEqual(['https://a.test', 'https://b.test']);
  });
});
