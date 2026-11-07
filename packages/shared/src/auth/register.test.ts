import { describe, expect, it } from 'vitest';
import { fieldErrors, registerSchema } from './register.js';

describe('registerSchema', () => {
  it('normalises email and drops an empty display name', () => {
    const result = registerSchema.parse({
      email: '  Filip@Example.COM ',
      password: 'long-enough-1',
      displayName: '  ',
    });
    expect(result).toEqual({ email: 'filip@example.com', password: 'long-enough-1' });
  });

  it('rejects an invalid email and a short password with one message per field', () => {
    const result = registerSchema.safeParse({ email: 'not-an-email', password: 'short' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error)).toEqual({
        email: 'Enter a valid email address',
        password: 'Password must be at least 10 characters',
      });
    }
  });
});
