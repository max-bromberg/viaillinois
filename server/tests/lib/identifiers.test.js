import { describe, it, expect } from 'vitest';
import { identifier, isSnowflake, snowflake } from '../../lib/identifiers.js';

/**
 * The two kinds of identifier the internal service API reads, in one place.
 *
 * Both were written out three times over, once per file that needed them, and
 * a rule about what a Discord identifier is has to be the same rule everywhere
 * or the acting middleware and the endpoint behind it disagree about who a
 * request is for.
 */
describe('identifier', () => {
  it('reads a positive whole number out of a path segment', () => {
    expect(identifier('10')).toBe(10);
    expect(identifier(10)).toBe(10);
    expect(identifier('0')).toBe(0);
  });

  it('answers null for anything that is not one', () => {
    for (const raw of ['', '  ', 'ten', '1.5', '-1', '1e3', null, undefined, {}]) {
      expect(identifier(raw)).toBeNull();
    }
  });
});

describe('a Discord snowflake', () => {
  it('is a decimal string, and is never read as a number', () => {
    expect(isSnowflake('204255221017214977')).toBe(true);
    expect(snowflake('204255221017214977')).toBe('204255221017214977');
  });

  it('is nothing else', () => {
    for (const raw of ['', 'abc', '12a', '1'.repeat(33), 204255221017214977, null, undefined]) {
      expect(isSnowflake(raw)).toBe(false);
      expect(snowflake(raw)).toBeNull();
    }
  });
});
