import { describe, expect, it } from 'vitest';
import { isCronAuthorized } from './jobs.controller.js';

const SECRET = 'a-long-enough-secret-value';

describe('isCronAuthorized', () => {
  it('accepts exactly the bearer secret', () => {
    expect(isCronAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it('refuses a wrong, missing or malformed header', () => {
    expect(isCronAuthorized(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(isCronAuthorized(SECRET, SECRET)).toBe(false);
    expect(isCronAuthorized(undefined, SECRET)).toBe(false);
  });

  it('is closed when no secret, or a weak one, is configured', () => {
    expect(isCronAuthorized('Bearer ', undefined)).toBe(false);
    expect(isCronAuthorized('Bearer short', 'short')).toBe(false);
  });
});
