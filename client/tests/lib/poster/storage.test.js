import { describe, it, expect, beforeEach, vi } from 'vitest';
import { forgetDesign, readDesign, writeDesign } from '../../../src/lib/poster/storage.js';
import { addLayer, blankPoster, makeLayer } from '../../../src/lib/poster/document.js';

/**
 * Where a design is kept between visits.
 *
 * A design lives in the browser that made it, against the event it is a poster
 * for, so a board member who reloads the page or comes back after lunch finds
 * their work where they left it. It is this browser and this person only: it
 * does not follow them to another machine and a co-organizer does not see it,
 * which is what the page says in as many words rather than leaving anybody to
 * find out.
 *
 * Every read and every write is guarded. Browser storage throws in a private
 * window and comes back empty where site data was cleared, and a designer that
 * refused to open because it could not remember anything would be worse than
 * one that simply starts fresh.
 */
describe('a saved design', () => {
  const poster = addLayer(blankPoster('#101010'), makeLayer('text', { text: 'Kept' }));

  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('comes back as it went in', () => {
    writeDesign(12, poster);
    expect(readDesign(12).background).toBe('#101010');
    expect(readDesign(12).layers[0].text).toBe('Kept');
  });

  it('is kept against one event, so another event opens on its own design', () => {
    writeDesign(12, poster);
    expect(readDesign(13)).toBe(null);
  });

  it('is nothing at all before anything has been saved', () => {
    expect(readDesign(12)).toBe(null);
  });

  it('is forgotten when a board starts again from a template', () => {
    writeDesign(12, poster);
    forgetDesign(12);
    expect(readDesign(12)).toBe(null);
  });

  it('reads as nothing where what was stored is not a poster', () => {
    window.localStorage.setItem('via.poster.12', 'not a poster at all');
    expect(readDesign(12)).toBe(null);

    window.localStorage.setItem('via.poster.12', '{"background":"#fff"}');
    expect(readDesign(12)).toBe(null);
  });

  /**
   * A private window throws on the way in and on the way out. Neither is a
   * reason for the designer not to open.
   */
  it('carries on where the browser will not store anything', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.');
    });
    expect(() => writeDesign(12, poster)).not.toThrow();
    expect(writeDesign(12, poster)).toBe(false);
  });

  it('carries on where the browser will not be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Access is denied for this document.');
    });
    expect(readDesign(12)).toBe(null);
  });
});
