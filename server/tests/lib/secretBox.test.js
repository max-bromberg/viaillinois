import { describe, it, expect } from 'vitest';
import { keyFromHex, readKey, seal, open } from '../../lib/secretBox.js';

/**
 * The one secret the web platform keeps on a person's behalf.
 *
 * A Discord refresh token in the Discord_Links row is what lets the linked
 * role facts be refreshed later without asking the person again, so it is
 * sealed before it is stored and opened only to be used. What matters here is
 * that a sealed value is unreadable without the key, that the wrong key does
 * not quietly return something, and that a changed byte is refused rather than
 * decrypted into nonsense.
 */
const KEY_HEX = 'a'.repeat(64);
const OTHER_HEX = 'b'.repeat(64);

describe('the sealed box the Discord authorization is kept in', () => {
  const key = keyFromHex(KEY_HEX);

  it('opens what it sealed', () => {
    const sealed = seal('a-refresh-token', key);
    expect(open(sealed, key)).toBe('a-refresh-token');
  });

  it('seals to bytes that do not contain the plain text', () => {
    const sealed = seal('a-refresh-token', key);
    expect(Buffer.isBuffer(sealed)).toBe(true);
    expect(sealed.toString('latin1')).not.toContain('a-refresh-token');
  });

  it('seals the same text differently every time', () => {
    expect(seal('a-refresh-token', key).equals(seal('a-refresh-token', key))).toBe(false);
  });

  it('refuses to open with the wrong key', () => {
    const sealed = seal('a-refresh-token', key);
    expect(() => open(sealed, keyFromHex(OTHER_HEX))).toThrow();
  });

  it('refuses to open a value somebody changed', () => {
    const sealed = seal('a-refresh-token', key);
    const tampered = Buffer.from(sealed);
    tampered[tampered.length - 1] ^= 1;
    expect(() => open(tampered, key)).toThrow();
  });

  it('refuses a key that is not thirty two bytes of hexadecimal', () => {
    expect(() => keyFromHex('abc')).toThrow();
    expect(() => keyFromHex('z'.repeat(64))).toThrow();
  });

  it('reads the key from the environment, and answers null when none is set', () => {
    expect(readKey({ DISCORD_LINK_KEY: KEY_HEX })).toEqual(key);
    expect(readKey({})).toBeNull();
    expect(readKey({ DISCORD_LINK_KEY: '' })).toBeNull();
  });
});
