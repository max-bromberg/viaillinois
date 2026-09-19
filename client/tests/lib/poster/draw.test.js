import { describe, it, expect } from 'vitest';
import { addLayer, blankPoster, makeLayer } from '../../../src/lib/poster/document.js';
import { drawPoster, textHeights, wrapText } from '../../../src/lib/poster/draw.js';

/**
 * Drawing a poster.
 *
 * One function draws a document, and both the preview on the screen and the
 * file that downloads go through it. Two renderings would drift, and a board
 * that downloaded something other than what they designed would stop trusting
 * the preview, which is the whole of what makes the designer usable.
 *
 * There is no canvas in a test, so what is drawn is recorded instead: a
 * context that writes down every call in order. That is enough to hold the
 * things that matter here, which are that every layer is drawn, that they are
 * drawn in the order the document stacks them, and that a layer which has
 * nothing to draw is skipped rather than drawn as a hole.
 */
function recorder() {
  const calls = [];
  const context = {
    canvas: { width: 800, height: 1050 },
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    translate: (...args) => calls.push(['translate', ...args]),
    rotate: (...args) => calls.push(['rotate', ...args]),
    beginPath: () => calls.push(['beginPath']),
    closePath: () => calls.push(['closePath']),
    moveTo: (...args) => calls.push(['moveTo', ...args]),
    lineTo: (...args) => calls.push(['lineTo', ...args]),
    arcTo: (...args) => calls.push(['arcTo', ...args]),
    ellipse: (...args) => calls.push(['ellipse', ...args]),
    rect: (...args) => calls.push(['rect', ...args]),
    fill: () => calls.push(['fill']),
    stroke: () => calls.push(['stroke']),
    clip: () => calls.push(['clip']),
    fillRect: (...args) => calls.push(['fillRect', ...args]),
    fillText: (...args) => calls.push(['fillText', ...args]),
    drawImage: (...args) => calls.push(['drawImage', ...args]),
    measureText: text => ({ width: text.length * 10 }),
  };
  return { context, calls, of: name => calls.filter(call => call[0] === name) };
}

describe('drawing a poster', () => {
  it('fills the ground before anything is put on it', () => {
    const { context, calls } = recorder();
    drawPoster(context, { ...blankPoster('#123456') });
    expect(calls[0]).toEqual(['fillRect', 0, 0, 800, 1050]);
    expect(context.fillStyle).toBe('#123456');
  });

  it('draws the layers in the order the document stacks them', () => {
    const poster = addLayer(
      addLayer(blankPoster(), makeLayer('text', { text: 'Under', x: 10, y: 10 })),
      makeLayer('text', { text: 'Over', x: 20, y: 20 }),
    );
    const { context, of } = recorder();
    drawPoster(context, poster);
    const written = of('fillText').map(call => call[1]);
    expect(written).toEqual(['Under', 'Over']);
  });

  it('draws a shape where the layer sits', () => {
    const poster = addLayer(blankPoster(), makeLayer('shape', {
      x: 100, y: 200, width: 300, height: 40, shape: 'rectangle',
    }));
    const { context, of } = recorder();
    drawPoster(context, poster);
    expect(of('rect')[0]).toEqual(['rect', 100, 200, 300, 40]);
  });

  it('draws an ellipse for a layer that asked to be one', () => {
    const poster = addLayer(blankPoster(), makeLayer('shape', {
      x: 0, y: 0, width: 200, height: 100, shape: 'ellipse',
    }));
    const { context, of } = recorder();
    drawPoster(context, poster);
    expect(of('ellipse')).toHaveLength(1);
    expect(of('rect')).toHaveLength(0);
  });

  /**
   * An image layer with nothing in it yet is a box a board is about to fill.
   * Drawing it as a black rectangle on the downloaded poster would be worse
   * than drawing nothing.
   */
  it('skips an image layer that has no image in it', () => {
    const poster = addLayer(blankPoster(), makeLayer('image', { src: null }));
    const { context, of } = recorder();
    drawPoster(context, poster);
    expect(of('drawImage')).toHaveLength(0);
  });

  it('draws an image once the editor has loaded it', () => {
    const layer = makeLayer('image', { id: 'photo', src: 'data:image/png;base64,x' });
    const poster = addLayer(blankPoster(), layer);
    const { context, of } = recorder();
    drawPoster(context, poster, {
      images: { photo: { naturalWidth: 400, naturalHeight: 200 } },
    });
    expect(of('drawImage')).toHaveLength(1);
  });

  it('draws the link square out of the canvas the editor made for it', () => {
    const layer = makeLayer('qr', { id: 'square', href: 'https://viaillinois.com/events/1' });
    const poster = addLayer(blankPoster(), layer);
    const { context, of } = recorder();
    drawPoster(context, poster, { codes: { square: { width: 160, height: 160 } } });
    expect(of('drawImage')).toHaveLength(1);
  });

  it('turns a layer that was given a rotation', () => {
    const poster = addLayer(blankPoster(), makeLayer('shape', { rotation: 90 }));
    const { context, of } = recorder();
    drawPoster(context, poster);
    expect(of('rotate')[0][1]).toBeCloseTo(Math.PI / 2, 6);
  });

  it('leaves a hidden layer off the poster', () => {
    const poster = addLayer(blankPoster(), makeLayer('text', { text: 'Not this', hidden: true }));
    const { context, of } = recorder();
    drawPoster(context, poster);
    expect(of('fillText')).toHaveLength(0);
  });
});

describe('the words of a text layer', () => {
  const { context } = recorder();

  it('breaks a line where it runs past the width of its box', () => {
    // The recorder measures ten pixels to the character, so thirty five
    // pixels holds three characters and no more.
    expect(wrapText(context, 'aaa bbb ccc', 35)).toEqual(['aaa', 'bbb', 'ccc']);
  });

  it('breaks where the words were already broken', () => {
    expect(wrapText(context, 'One\nTwo', 10_000)).toEqual(['One', 'Two']);
  });

  it('keeps a word longer than its box rather than dropping it', () => {
    expect(wrapText(context, 'antidisestablishmentarianism', 20))
      .toEqual(['antidisestablishmentarianism']);
  });

  /**
   * A block of text is as tall as its words, so the handles around it and the
   * layer list both read the height from here rather than from the document.
   */
  it('measures how tall a block of text comes out', () => {
    const poster = addLayer(blankPoster(), makeLayer('text', {
      id: 'words', text: 'aaa bbb ccc', width: 35, fontSize: 20, lineHeight: 1.5,
    }));
    expect(textHeights(context, poster)).toEqual({ words: 90 });
  });
});
