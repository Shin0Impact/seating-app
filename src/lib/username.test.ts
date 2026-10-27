import { describe, expect, it } from 'vitest';
import { displayName, toLoginEmail } from './username';

describe('username login', () => {
  it('maps plain usernames to the fixed domain', () => {
    expect(toLoginEmail(' Maher ')).toBe('maher@seating.example.com');
  });
  it('keeps real emails as they are', () => {
    expect(toLoginEmail('A@B.com')).toBe('a@b.com');
  });
  it('shows usernames without the domain', () => {
    expect(displayName('maher@seating.example.com')).toBe('maher');
    expect(displayName('a@b.com')).toBe('a@b.com');
    expect(displayName(null)).toBe('');
  });
});
