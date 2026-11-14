import type { NewUser, User } from './user.entity.js';

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');

/** Raised when an insert hits the unique email constraint (e.g. two sign-ups at once). */
export class DuplicateEmailError extends Error {
  constructor() {
    super('Email already registered');
  }
}

export interface UsersRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  /** Every user's id, oldest first. Only for system jobs that act for all users, one at a time. */
  listIds(): Promise<string[]>;
  setPasswordHash(id: string, passwordHash: string): Promise<void>;
  /** @throws DuplicateEmailError */
  create(user: NewUser): Promise<User>;
}
