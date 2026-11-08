import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ErrorCode, type LoginData, type RegisterData, type UserResponse } from '@nestmint/shared';
import { randomUUID } from 'node:crypto';
import { ApiException } from '../common/api.exception.js';
import type { User } from '../users/user.entity.js';
import {
  DuplicateEmailError,
  USERS_REPOSITORY,
  type UsersRepository,
} from '../users/users.repository.js';
import { LoginRateLimiter } from './login-rate-limiter.js';
import { PasswordHasher } from './password-hasher.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private dummyHash: Promise<string> | undefined;

  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    private readonly hasher: PasswordHasher,
    private readonly rateLimiter: LoginRateLimiter,
  ) {}

  async register(input: RegisterData): Promise<UserResponse> {
    if (await this.users.findByEmail(input.email)) {
      throw emailTaken();
    }

    const passwordHash = await this.hasher.hash(input.password);
    try {
      const user = await this.users.create({
        email: input.email,
        passwordHash,
        ...(input.displayName ? { displayName: input.displayName } : {}),
      });
      this.logger.log(`User registered: ${user.id}`);
      return toUserResponse(user);
    } catch (error) {
      if (error instanceof DuplicateEmailError) throw emailTaken();
      throw error;
    }
  }

  /**
   * Checks the credentials. Unknown email and wrong password give the same error and take the
   * same time (a password check always runs), so the response never reveals which emails exist.
   */
  async authenticate(input: LoginData, clientIp: string): Promise<User> {
    const key = `${clientIp}|${input.email}`;
    this.rateLimiter.assertAllowed(key);

    const user = await this.users.findByEmail(input.email);
    const hash = user ? user.passwordHash : await this.getDummyHash();
    const valid = await this.hasher.verify(hash, input.password);

    if (!user || !valid) {
      this.rateLimiter.recordFailure(key);
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.InvalidCredentials,
        'Invalid email or password.',
      );
    }
    this.rateLimiter.reset(key);
    return user;
  }

  async getProfile(userId: string): Promise<UserResponse> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, ErrorCode.Unauthorized, 'Please log in.');
    }
    return toUserResponse(user);
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.hasher.hash(randomUUID());
    return this.dummyHash;
  }
}

function emailTaken(): ApiException {
  return new ApiException(
    HttpStatus.CONFLICT,
    ErrorCode.EmailAlreadyRegistered,
    'An account with this email already exists.',
    { email: 'An account with this email already exists' },
  );
}

function toUserResponse(user: User): UserResponse {
  return { id: user.id, email: user.email, displayName: user.displayName };
}
