import { Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';
import { Clock } from '../common/clock.js';
import { AuthConfig } from './auth.config.js';

const ISSUER = 'nestmint';

@Injectable()
export class AccessTokenService {
  constructor(
    private readonly config: AuthConfig,
    private readonly clock: Clock,
  ) {}

  sign(userId: string): Promise<string> {
    const issuedAt = Math.floor(this.clock.now().getTime() / 1000);
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + this.config.accessTtlSeconds)
      .sign(this.config.jwtSecret);
  }

  /** Returns the user id, or null when the token is invalid or expired. */
  async verify(token: string): Promise<string | null> {
    try {
      const { payload } = await jwtVerify(token, this.config.jwtSecret, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        currentDate: this.clock.now(),
      });
      return payload.sub ?? null;
    } catch {
      return null;
    }
  }
}
