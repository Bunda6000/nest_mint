import { describe, expect, it } from 'vitest';
import { loginSchema } from './login.js';
import { fieldErrors } from './register.js';

describe('loginSchema', () => {
  it('normalises the email and keeps the password untouched', () => {
    const result = loginSchema.parse({ email: ' Filip@Example.COM ', password: ' pass word ' });
    expect(result).toEqual({ email: 'filip@example.com', password: ' pass word ' });
  });

  it('asks for both fields when they are empty', () => {
    const result = loginSchema.safeParse({ email: '', password: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error)).toEqual({
        email: 'Enter a valid email address',
        password: 'Enter your password',
      });
    }
  });
});
