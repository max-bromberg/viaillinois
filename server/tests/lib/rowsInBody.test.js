import { describe, it, expect } from 'vitest';
import { rowsInBody } from '../../lib/rowsInBody.js';

/**
 * The row budget measures what a caller was actually served. Counting here,
 * from the payload, rather than in each controller, means a route added later
 * is counted without anybody having to remember to count it.
 */
describe('rowsInBody', () => {
  it('counts the events in a feed response', () => {
    expect(rowsInBody({ events: [{}, {}, {}], total: 412 })).toBe(3);
  });

  it('counts a bare array', () => {
    expect(rowsInBody([{}, {}])).toBe(2);
  });

  it('counts every list in a response that carries more than one', () => {
    expect(rowsInBody({ events: [{}, {}], midterms: [{}] })).toBe(3);
  });

  it('counts a single object as one row', () => {
    expect(rowsInBody({ event: { event_id: 1 } })).toBe(1);
  });

  it('ignores a count, which is a number rather than rows', () => {
    expect(rowsInBody({ events: [], total: 9999 })).toBe(0);
  });

  it('counts nothing for a refusal, so a refused caller is not charged twice', () => {
    expect(rowsInBody({ error: 'Event not found' })).toBe(0);
  });

  it('survives a body that is not an object', () => {
    expect(rowsInBody(null)).toBe(0);
    expect(rowsInBody('ok')).toBe(0);
  });
});
