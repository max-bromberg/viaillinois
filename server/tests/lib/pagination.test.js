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
