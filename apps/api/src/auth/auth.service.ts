import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ErrorCode, type RegisterData, type UserResponse } from '@nestmint/shared';
import { ApiException } from '../common/api.exception.js';
import type { User } from '../users/user.entity.js';
import {
  DuplicateEmailError,
  USERS_REPOSITORY,
  type UsersRepository,
} from '../users/users.repository.js';
import { PasswordHasher } from './password-hasher.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    private readonly hasher: PasswordHasher,
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
