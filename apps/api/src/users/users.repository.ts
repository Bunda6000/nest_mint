import type { NewUser, User } from './user.entity.js';

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');

/** Raised when an insert hits the unique email constraint (e.g. two sign-ups at once). */
export class DuplicateEmailError extends Error {
  constructor() {
    super('Email already registered');
  }
}

export interface UsersRepository {
  findByEmail(email: string): Promise<User | null>;
  /** @throws DuplicateEmailError */
  create(user: NewUser): Promise<User>;
}
