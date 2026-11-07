import { Injectable } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';

/** Argon2id with OWASP-recommended parameters (19 MiB memory, 2 iterations). */
@Injectable()
export class PasswordHasher {
  private readonly options = {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  };

  hash(password: string): Promise<string> {
    return hash(password, this.options);
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password);
  }
}
