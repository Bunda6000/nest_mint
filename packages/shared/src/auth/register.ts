import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 10;

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
    .max(128, 'Password must be at most 128 characters'),
  displayName: z
    .string()
    .trim()
    .max(80, 'Name must be at most 80 characters')
    .transform((value) => value || undefined)
    .optional(),
});

export type RegisterInput = z.input<typeof registerSchema>;
export type RegisterData = z.output<typeof registerSchema>;

/** Public view of a user. Never includes the password hash. */
export interface UserResponse {
  id: string;
  email: string;
  displayName: string | null;
}

/** Returns the first message per field, e.g. { password: 'Password must be…' }. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path.join('.') || 'form';
    result[field] ??= issue.message;
  }
  return result;
}
