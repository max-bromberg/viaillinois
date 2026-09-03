import { describe, it, expect } from 'vitest';
import { readPaging, PAGING_LIMITS } from '../../lib/pagination.js';

const EVENTS = PAGING_LIMITS.events;

/**
 * Nothing bounded these before. A request could ask for every row in the table
 * at once, which is both the cheapest way to collect the corpus and the
 * cheapest way to exhaust the process, and a limit that was not a number
 * reached the database as LIMIT NaN and came back as a 500.
 */
describe('readPaging', () => {
  it('uses the route default when nothing is asked for', () => {
    expect(readPaging({}, EVENTS)).toEqual({ limit: 50, offset: 0, refusal: null });
  });

  it('honours a limit within the maximum', () => {
    expect(readPaging({ limit: '25' }, EVENTS)).toEqual({ limit: 25, offset: 0, refusal: null });
  });

  it('clamps a limit above the maximum rather than refusing it', () => {
    expect(readPaging({ limit: '999999999' }, EVENTS))
      .toEqual({ limit: 100, offset: 0, refusal: null });
  });

  it('refuses a limit that is not a number', () => {
    const result = readPaging({ limit: 'abc' }, EVENTS);
    expect(result.refusal).toBe('limit and offset must be whole numbers of zero or more.');
  });

  it('refuses a negative offset', () => {
    expect(readPaging({ offset: '-1' }, EVENTS).refusal)
      .toBe('limit and offset must be whole numbers of zero or more.');
  });

  it('refuses a fractional limit', () => {
    expect(readPaging({ limit: '10.5' }, EVENTS).refusal)
      .toBe('limit and offset must be whole numbers of zero or more.');
  });

  it('refuses paging deeper than the route allows, and says what to do instead', () => {
    expect(readPaging({ offset: '5001' }, EVENTS).refusal)
      .toBe('That page is too far into the results. Please narrow the range by date.');
  });

  it('allows the deepest permitted page', () => {
    expect(readPaging({ offset: '5000' }, EVENTS))
      .toEqual({ limit: 50, offset: 5000, refusal: null });
  });

  it('gives the kiosk its own smaller ceiling', () => {
    expect(readPaging({ limit: '500' }, PAGING_LIMITS.kiosk))
      .toEqual({ limit: 50, offset: 0, refusal: null });
  });

  it('accepts a number as readily as a string, because a caller may send either', () => {
    expect(readPaging({ limit: 10, offset: 20 }, EVENTS))
      .toEqual({ limit: 10, offset: 20, refusal: null });
  });

  it('leaves the venues search box serving the ten results it always served', () => {
    expect(readPaging({}, PAGING_LIMITS.venues))
      .toEqual({ limit: 10, offset: 0, refusal: null });
  });
});

/**
 * Edge cases that reach this module from a real query string. Each one was
 * noticed during review and left untested, which meant the behaviour was
 * whatever Number() happened to do rather than something anybody had decided.
 */
describe('readPaging on input that is not a plain number', () => {
  it('treats an empty value as one that was not given at all', () => {
    // ?limit= is a caller that built a URL from an empty field, not one asking
    // for nonsense, so it gets the default rather than a refusal.
    expect(readPaging({ limit: '' }, PAGING_LIMITS.events).limit).toBe(50);
    expect(readPaging({ limit: '' }, PAGING_LIMITS.events).refusal).toBeNull();
  });

  it('accepts a number with spaces around it', () => {
    expect(readPaging({ limit: ' 10 ' }, PAGING_LIMITS.events).limit).toBe(10);
  });

  it('refuses a value that is infinite rather than clamping it', () => {
    expect(readPaging({ limit: 'Infinity' }, PAGING_LIMITS.events).refusal).not.toBeNull();
    expect(readPaging({ offset: 'Infinity' }, PAGING_LIMITS.events).refusal).not.toBeNull();
  });

  it('refuses a repeated parameter rather than reading one of the two', () => {
    expect(readPaging({ limit: ['1', '2'] }, PAGING_LIMITS.events).refusal).not.toBeNull();
  });

  it('refuses a list even when it holds a single number', () => {
    // Number(['10']) is 10, so a one element list used to be accepted as
    // though the caller had sent a number. It did not, and reading it as one
    // is a guess.
    expect(readPaging({ limit: ['10'] }, PAGING_LIMITS.events).refusal).not.toBeNull();
  });

  it('refuses an object, which is what a nested parameter parses to', () => {
    expect(readPaging({ offset: { a: '1' } }, PAGING_LIMITS.events).refusal).not.toBeNull();
  });
});
