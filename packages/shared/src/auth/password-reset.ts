import { z } from 'zod';
import { PASSWORD_MIN_LENGTH } from './register.js';

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
});
export type PasswordResetRequestData = z.output<typeof passwordResetRequestSchema>;

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(20, 'This link is not valid').max(200, 'This link is not valid'),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
    .max(128, 'Password must be at most 128 characters'),
});
export type PasswordResetConfirmData = z.output<typeof passwordResetConfirmSchema>;
