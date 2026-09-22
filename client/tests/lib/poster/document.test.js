import { describe, it, expect } from 'vitest';
import {
  POSTER_HEIGHT, POSTER_WIDTH,
  addLayer, blankPoster, boundsOf, duplicateLayer, layerAt, makeLayer, moveLayer,
  raiseLayer, removeLayer, resizeLayer, updateLayer,
} from '../../../src/lib/poster/document.js';

/**
 * The poster as a document.
 *
 * The designer used to draw one fixed layout with a handful of switches over
 * it, so a board could change the colour of the poster but not where anything
 * sat on it. What a board is given now is a document: a ground and a stack of
 * layers, each of which can be moved, sized, restyled and reordered. Everything
 * here is a pure function over that document, so the editor keeps no rules of
 * its own about what a poster may be.
 */
describe('a poster document', () => {
  it('is the printed size, which is what downloads', () => {
    const poster = blankPoster();
    expect(poster.width).toBe(POSTER_WIDTH);
    expect(poster.height).toBe(POSTER_HEIGHT);
    expect(poster.layers).toEqual([]);
  });

  it('gives every layer an identifier of its own', () => {
    const one = makeLayer('text', { text: 'A' });
    const two = makeLayer('text', { text: 'B' });
    expect(one.id).not.toBe(two.id);
  });

  it('never changes the document it was given', () => {
    const poster = blankPoster();
    const after = addLayer(poster, makeLayer('text', { text: 'Anything' }));
    expect(poster.layers).toEqual([]);
    expect(after.layers).toHaveLength(1);
  });

  it('puts a new layer on top, which is where a person expects what they just added', () => {
    const poster = addLayer(
      addLayer(blankPoster(), makeLayer('text', { text: 'Under' })),
      makeLayer('text', { text: 'Over' }),
    );
    expect(poster.layers.at(-1).text).toBe('Over');
  });
});

describe('moving and sizing a layer', () => {
  const poster = addLayer(blankPoster(), makeLayer('shape', {
    id: 'box', x: 100, y: 100, width: 200, height: 120,
  }));

  it('moves a layer by the distance it was dragged', () => {
    const moved = layerAt(moveLayer(poster, 'box', 40, -25), 'box');
    expect(moved.x).toBe(140);
    expect(moved.y).toBe(75);
  });

  /**
   * A layer dragged off the edge is not lost. Something a board cannot see is
   * something they cannot drag back, so a layer is always left with a corner
   * of itself on the poster.
   */
  it('keeps a layer reachable when it is dragged off the poster', () => {
    const far = layerAt(moveLayer(poster, 'box', 5000, 5000), 'box');
    expect(far.x).toBeLessThan(POSTER_WIDTH);
    expect(far.y).toBeLessThan(POSTER_HEIGHT);

    const back = layerAt(moveLayer(poster, 'box', -5000, -5000), 'box');
    expect(back.x + back.width).toBeGreaterThan(0);
    expect(back.y + back.height).toBeGreaterThan(0);
  });

  it('sizes a layer from the edge that was dragged, leaving the other where it was', () => {
    const wider = layerAt(resizeLayer(poster, 'box', 'east', 50, 0), 'box');
    expect(wider.x).toBe(100);
    expect(wider.width).toBe(250);

    const fromTheLeft = layerAt(resizeLayer(poster, 'box', 'west', 50, 0), 'box');
    expect(fromTheLeft.x).toBe(150);
    expect(fromTheLeft.width).toBe(150);
  });

  it('never sizes a layer down to nothing', () => {
    const squashed = layerAt(resizeLayer(poster, 'box', 'east', -1000, 0), 'box');
    expect(squashed.width).toBeGreaterThan(0);
  });

  /**
   * A text layer is as tall as its words, which the drawing works out, so
   * dragging it taller would say something the poster cannot honour.
   */
  it('sizes a block of text by its width alone', () => {
    const words = addLayer(blankPoster(), makeLayer('text', {
      id: 'words', x: 0, y: 0, width: 300, height: 80, text: 'A line of it',
    }));
    const taller = layerAt(resizeLayer(words, 'words', 'south', 0, 60), 'words');
    expect(taller.height).toBe(80);

    const wider = layerAt(resizeLayer(words, 'words', 'east', 60, 0), 'words');
    expect(wider.width).toBe(360);
  });

  it('turns a drag on a rotated layer into a drag along its own edges', () => {
    const turned = addLayer(blankPoster(), makeLayer('shape', {
      id: 'turned', x: 100, y: 100, width: 200, height: 100, rotation: 90,
    }));
    // A quarter turn puts the layer's own east edge along the screen's south.
    const wider = layerAt(resizeLayer(turned, 'turned', 'east', 0, 40), 'turned');
    expect(wider.width).toBeCloseTo(240, 5);
  });
});

describe('the order layers are drawn in', () => {
  const stack = ['a', 'b', 'c'].reduce(
    (poster, id) => addLayer(poster, makeLayer('shape', { id })),
    blankPoster(),
  );
  const order = poster => poster.layers.map(layer => layer.id);

  it('raises a layer one step, so a board can nudge it out from under another', () => {
    expect(order(raiseLayer(stack, 'a', 1))).toEqual(['b', 'a', 'c']);
  });

  it('lowers a layer one step', () => {
    expect(order(raiseLayer(stack, 'c', -1))).toEqual(['a', 'c', 'b']);
  });

  it('leaves the order alone at the top and at the bottom', () => {
    expect(order(raiseLayer(stack, 'c', 1))).toEqual(['a', 'b', 'c']);
    expect(order(raiseLayer(stack, 'a', -1))).toEqual(['a', 'b', 'c']);
  });

  it('removes a layer and leaves the rest where they were', () => {
    expect(order(removeLayer(stack, 'b'))).toEqual(['a', 'c']);
  });

  /** A copy sits just above the original and slightly across it, so it is visible. */
  it('copies a layer above the one it was copied from, and off to the side', () => {
    const copied = duplicateLayer(stack, 'a');
    expect(copied.layers).toHaveLength(4);
    expect(copied.layers[1].id).not.toBe('a');
    expect(copied.layers[1].x).toBeGreaterThan(stack.layers[0].x);
  });

  it('answers with the document it was given when the layer is not on it', () => {
    expect(removeLayer(stack, 'nothing')).toBe(stack);
    expect(raiseLayer(stack, 'nothing', 1)).toBe(stack);
    expect(duplicateLayer(stack, 'nothing')).toBe(stack);
  });
});

describe('changing what a layer says', () => {
  const poster = addLayer(blankPoster(), makeLayer('text', {
    id: 'words', text: 'Before', fontSize: 40,
  }));

  it('takes only the properties it was handed', () => {
    const after = layerAt(updateLayer(poster, 'words', { text: 'After' }), 'words');
    expect(after.text).toBe('After');
    expect(after.fontSize).toBe(40);
  });

  it('reads the bounds of a layer as the drawing and the handles both need them', () => {
    const bounds = boundsOf(makeLayer('shape', { x: 10, y: 20, width: 30, height: 40 }));
    expect(bounds).toEqual({ left: 10, top: 20, right: 40, bottom: 60 });
  });
});
