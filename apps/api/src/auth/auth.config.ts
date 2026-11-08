import { allowedOrigins } from '../common/origins.js';

export class AuthConfig {
  constructor(
    readonly jwtSecret: Uint8Array,
    readonly accessTtlSeconds: number,
    readonly refreshTtlSeconds: number,
    readonly cookieSecure: boolean,
    readonly allowedOrigins: string[],
  ) {}
}

const MIN_SECRET_LENGTH = 32;
const PLACEHOLDER_SECRET = 'change-me-to-a-random-string-of-at-least-32-characters';

/** Reads and validates the auth settings. Throws at startup so a bad setup is obvious. */
export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const secret = env.JWT_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be set and at least ${MIN_SECRET_LENGTH} characters long`);
  }
  const production = env.NODE_ENV === 'production';
  if (production && secret === PLACEHOLDER_SECRET) {
    throw new Error('JWT_SECRET is still the example value; set a random secret');
  }
  return new AuthConfig(
    new TextEncoder().encode(secret),
    15 * 60,
    30 * 24 * 60 * 60,
    production,
    allowedOrigins(env),
  );
}
