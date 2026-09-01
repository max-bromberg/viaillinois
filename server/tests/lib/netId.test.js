import { describe, it, expect } from 'vitest';
import { parseRoster } from '../../lib/netId.js';

/**
 * A board building its roster pastes what it already has: a column from a
 * spreadsheet, a list of NetIDs, a list of Illinois addresses, or a mixture
 * with stray commas and blank lines.
 */
describe('parseRoster', () => {
  it('reads one NetID', () => {
    expect(parseRoster('abromb2')).toEqual({ netIds: ['abromb2'], rejected: [] });
  });

  it('reads a list separated by newlines, commas or semicolons', () => {
    expect(parseRoster('one\ntwo, three; four').netIds).toEqual(['one', 'two', 'three', 'four']);
  });

  /**
   * A pasted spreadsheet column carries names next to addresses. Splitting on
   * spaces turned "Jane Doe jdoe2@illinois.edu" into three NetIDs and created
   * three accounts, two of which were words from a person's name. A field
   * with spaces in it is reported instead, because there is no way to tell
   * which word was meant to be the NetID.
   */
  it('reports a field containing spaces rather than inventing NetIDs from it', () => {
    const result = parseRoster('Jane Doe jdoe2@illinois.edu');
    expect(result.netIds).toEqual([]);
    expect(result.rejected).toEqual(['Jane Doe jdoe2@illinois.edu']);
  });

  it('reads a spreadsheet column where each row is a name and an address', () => {
    const result = parseRoster('Jane Doe,jdoe2@illinois.edu\nSam Roe,sroe3@illinois.edu');
    expect(result.netIds).toEqual(['jdoe2', 'sroe3']);
    expect(result.rejected).toEqual(['Jane Doe', 'Sam Roe']);
  });

  it('ignores a header row people paste along with the data', () => {
    expect(parseRoster('NetID\nabromb2').netIds).toEqual(['abromb2']);
  });

  it('takes the NetID out of an Illinois address', () => {
    expect(parseRoster('abromb2@illinois.edu').netIds).toEqual(['abromb2']);
  });

  it('lowercases, because NetIDs are not case sensitive but the key is', () => {
    expect(parseRoster('ABromb2').netIds).toEqual(['abromb2']);
  });

  it('drops duplicates, including ones written differently', () => {
    expect(parseRoster('abromb2, ABROMB2@illinois.edu').netIds).toEqual(['abromb2']);
  });

  it('ignores blank lines and stray punctuation', () => {
    expect(parseRoster('one\n\n,,  \ntwo\n').netIds).toEqual(['one', 'two']);
  });

  /**
   * An address at another institution is reported rather than accepted,
   * because its local part is not a NetID and adding it would create an
   * account that can never be signed in to.
   */
  it('rejects an address that is not an Illinois one', () => {
    const result = parseRoster('someone@gmail.com');
    expect(result.netIds).toEqual([]);
    expect(result.rejected).toEqual(['someone@gmail.com']);
  });

  it('rejects anything that cannot be a NetID', () => {
    const result = parseRoster('netid!, ok2, x');
    expect(result.netIds).toEqual(['ok2']);
    expect(result.rejected).toEqual(['netid!', 'x']);
  });

  it('returns nothing for empty input', () => {
    expect(parseRoster('')).toEqual({ netIds: [], rejected: [] });
    expect(parseRoster(null)).toEqual({ netIds: [], rejected: [] });
  });
});
