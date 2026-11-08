import { z } from 'zod';
import type { UserResponse } from './register.js';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  password: z
    .string()
    .min(1, 'Enter your password')
    .max(128, 'Password must be at most 128 characters'),
});

export type LoginInput = z.input<typeof loginSchema>;
export type LoginData = z.output<typeof loginSchema>;

/** Returned by login and refresh. The refresh token travels in an HttpOnly cookie, not here. */
export interface SessionResponse {
  accessToken: string;
  /** Lifetime of the access token in seconds. */
  expiresIn: number;
  user: UserResponse;
}
