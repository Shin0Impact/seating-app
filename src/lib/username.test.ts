import { describe, expect, it } from 'vitest';
import { isValidUsername, normalizeUsername } from './username';

describe('username', () => {
  it('lowercases and trims', () => expect(normalizeUsername('  Jihad ')).toBe('jihad'));
  it('accepts plain names, including Arabic', () => {
    expect(isValidUsername('Jihad')).toBe(true);
    expect(isValidUsername('جهاد')).toBe(true);
  });
  it('rejects emails, spaces and bad lengths', () => {
    expect(isValidUsername('a@b.com')).toBe(false);
    expect(isValidUsername('two words')).toBe(false);
    expect(isValidUsername('a')).toBe(false);
    expect(isValidUsername('x'.repeat(31))).toBe(false);
  });
});
