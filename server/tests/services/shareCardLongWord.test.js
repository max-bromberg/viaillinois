import { describe, it, expect } from 'vitest';
import { cardSvg } from '../../services/shareCard.js';

/**
 * A word longer than the line it is on.
 *
 * The title is broken on spaces and a line is closed when the next word would
 * push it past the measure. A word that is longer than the whole measure never
 * pushes anything, because the line it would push is empty, so it was taken
 * whole and drawn off the right edge of the card. Course titles do this:
 * "Electroencephalographically" is twenty seven characters against a measure of
 * twenty six, and a card is the first thing anybody sees of a pasted link.
 *
 * The card is drawn from a fixed measure rather than from a real text
 * measurement, so the check here is on the lines the breaker produces.
 */
const MEASURE = 26;

/** The title lines the card actually draws, read back out of the drawing. */
function titleLinesOf(title) {
  const svg = cardSvg({
    event_id: 1, title, rso_name: 'IEEE',
    start_time: '2026-10-01 19:00:00',
    building: 'Electrical & Computer Eng Bldg', room_number: '1002', cancelled_at: null,
  });
  return [...svg.matchAll(/<text class="title"[^>]*>([^<]*)<\/text>/g)].map(m => m[1]);
}

describe('a title with a word longer than the line', () => {
  it('breaks the word rather than drawing it off the edge of the card', () => {
    for (const line of titleLinesOf('A Supercalifragilisticexpialidocious Workshop')) {
      expect(line.length, line).toBeLessThanOrEqual(MEASURE);
    }
  });

  it('breaks a real course title that is one character over the measure', () => {
    for (const line of titleLinesOf('Electroencephalographically Interfacing Microcontrollers')) {
      expect(line.length, line).toBeLessThanOrEqual(MEASURE);
    }
  });

  it('keeps the pieces of a broken word next to each other', () => {
    const lines = titleLinesOf('Antidisestablishmentarianismxyz workshop');
    expect(lines.join('').startsWith('Antidisestablishmentarianism')).toBe(true);
  });

  it('leaves an ordinary title exactly as it broke it before', () => {
    expect(titleLinesOf('Weekly general meeting')).toEqual(['Weekly general meeting']);
  });

  it('still breaks an ordinary long title on its spaces', () => {
    const lines = titleLinesOf('Introduction to circuit design for absolute beginners this term');
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.length, line).toBeLessThanOrEqual(MEASURE);
    expect(lines[0]).toBe('Introduction to circuit');
  });

  it('still says it ran out of room when it did', () => {
    const lines = titleLinesOf('Supercalifragilisticexpialidocious Antidisestablishmentarianism Pneumonoultramicroscopicsilicovolcanoconiosis');
    expect(lines.at(-1).endsWith('…')).toBe(true);
  });
});
