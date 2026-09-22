/**
 * The poster as a document.
 *
 * The designer used to draw one fixed layout with a handful of switches over
 * it: a board could change the colour of a poster and which of four pieces it
 * carried, and nothing else. Where the title sat, how big it was, whether the
 * room went above the date, whether there was a second image: none of that was
 * theirs to decide, and a board that wanted any of it went and made the poster
 * somewhere else.
 *
 * What a board is given now is a document. A poster is a ground and a stack of
 * layers, and every layer can be moved, sized, restyled, reordered, copied and
 * removed. Everything in this module is a pure function of a document and
 * answers with a new one, so the editor holds no rules of its own about what a
 * poster may be, and so undo is a stack of documents rather than a list of
 * things to put back.
 *
 * The colours a poster is drawn in are in posterPalette.js, which is held
 * against the design tokens by a test. See docs/design/04-color.md.
 */

/**
 * The size a poster is drawn and downloaded at. Eight hundred by a thousand
 * and fifty is close enough to the proportions of a sheet of letter paper that
 * a poster prints without a band down one side, and it is large enough to read
 * pinned to a corkboard.
 */
export const POSTER_WIDTH = 800;
export const POSTER_HEIGHT = 1050;

/** How little of a layer may be left on the poster before it stops moving. */
const MUST_STAY_ON = 24;

/** How small a layer may be dragged, in either direction. */
const SMALLEST = 16;

/** How far a copy sits from the layer it was copied from. */
const COPY_OFFSET = 24;

/** The kinds of layer a poster is made of. */
export const LAYER_KINDS = ['text', 'image', 'shape', 'qr'];

/**
 * What each kind of layer is when it is first added, beyond the position and
 * the size every layer has. A layer carries every property its kind can take,
 * set to something sensible, so that the inspector never has to ask whether a
 * property exists before it shows a control for it.
 */
const DEFAULTS = {
  text: {
    text: 'Say something here',
    fontKey: 'system-sans',
    fontSize: 32,
    weight: 700,
    italic: false,
    align: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
    color: '#0b1a1b',
    width: 420,
    height: 48,
  },
  image: {
    src: null,
    /** Whether the image fills the box and is cropped, or fits inside it whole. */
    fit: 'cover',
    opacity: 1,
    radius: 0,
    width: 320,
    height: 220,
  },
  shape: {
    shape: 'rectangle',
    fill: '#007c80',
    stroke: null,
    strokeWidth: 0,
    radius: 0,
    opacity: 1,
    width: 240,
    height: 160,
  },
  qr: {
    /** The address the square opens, which the editor sets to the event. */
    href: '',
    color: '#0b1a1b',
    background: '#ffffff',
    width: 160,
    height: 160,
  },
};

/** What each kind of layer is called in the layer list, before it is renamed. */
const KIND_NAMES = {
  text: 'Text',
  image: 'Image',
  shape: 'Shape',
  qr: 'The link square',
};

let counter = 0;

/** An identifier no other layer on this poster holds. */
function nextId() {
  counter += 1;
  return `layer-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A poster with nothing on it yet, which every template begins from. */
export function blankPoster(background = '#f5fafa') {
  return { width: POSTER_WIDTH, height: POSTER_HEIGHT, background, layers: [] };
}

/**
 * One layer, of a kind, with whatever the caller wants to say about it over
 * the defaults of that kind.
 */
export function makeLayer(kind, properties = {}) {
  return {
    id: nextId(),
    kind,
    name: KIND_NAMES[kind] ?? kind,
    x: 48,
    y: 48,
    rotation: 0,
    ...(DEFAULTS[kind] ?? {}),
    ...properties,
  };
}

/** The layer with this identifier, or null where the poster has none. */
export function layerAt(poster, id) {
  return poster.layers.find(layer => layer.id === id) ?? null;
}

/** Where a layer begins and ends, which the drawing and the handles both read. */
export function boundsOf(layer) {
  return {
    left: layer.x,
    top: layer.y,
    right: layer.x + layer.width,
    bottom: layer.y + layer.height,
  };
}

/** A new document with one layer on top of the ones already there. */
export function addLayer(poster, layer) {
  return { ...poster, layers: [...poster.layers, layer] };
}

/** A new document with one layer replaced by the answer of a function. */
function mapLayer(poster, id, change) {
  const at = poster.layers.findIndex(layer => layer.id === id);
  if (at === -1) return poster;
  const layers = [...poster.layers];
  layers[at] = change(layers[at]);
  return { ...poster, layers };
}

/** A new document with some of a layer's properties replaced. */
export function updateLayer(poster, id, properties) {
  return mapLayer(poster, id, layer => ({ ...layer, ...properties }));
}

/**
 * Hold a layer where a person can still reach it.
 *
 * A layer dragged clean off the edge is a layer that cannot be dragged back,
 * so a corner of every layer is kept on the poster. It is a corner rather than
 * the whole layer because a title that runs off the edge on purpose is a real
 * design, and one bled off the side of a poster is a common one.
 */
function held(layer) {
  const x = Math.min(
    Math.max(layer.x, MUST_STAY_ON - layer.width),
    POSTER_WIDTH - MUST_STAY_ON,
  );
  const y = Math.min(
    Math.max(layer.y, MUST_STAY_ON - layer.height),
    POSTER_HEIGHT - MUST_STAY_ON,
  );
  return { ...layer, x, y };
}

/** A new document with one layer moved by the distance it was dragged. */
export function moveLayer(poster, id, dx, dy) {
  return mapLayer(poster, id, layer => held({ ...layer, x: layer.x + dx, y: layer.y + dy }));
}

/**
 * A drag measured on the screen, measured along the layer's own edges instead.
 *
 * A layer can be turned, and the handle a person grabs turns with it, so a
 * drag away from the east handle of a layer stood on its side is a drag down
 * the screen. Undoing the rotation is what makes that drag widen the layer
 * rather than move it.
 */
function alongItsOwnEdges(layer, dx, dy) {
  const radians = ((layer.rotation ?? 0) * Math.PI) / 180;
  if (!radians) return { dx, dy };
  const cos = Math.cos(-radians);
  const sin = Math.sin(-radians);
  return { dx: dx * cos - dy * sin, dy: dx * sin + dy * cos };
}

/**
 * A new document with one layer sized from the handle that was dragged.
 *
 * The edge opposite the handle stays where it is, which is what a person
 * dragging the left edge of something means. A block of text takes its height
 * from its own words, which the drawing works out from the face and the size,
 * so dragging one up or down changes nothing: only its width is its own.
 */
export function resizeLayer(poster, id, handle, screenDx, screenDy) {
  return mapLayer(poster, id, layer => {
    const { dx, dy } = alongItsOwnEdges(layer, screenDx, screenDy);
    const text = layer.kind === 'text';
    let { x, y, width, height } = layer;

    if (handle.includes('east')) width = Math.max(SMALLEST, width + dx);
    if (handle.includes('west')) {
      const next = Math.max(SMALLEST, width - dx);
      x += width - next;
      width = next;
    }
    if (!text && handle.includes('south')) height = Math.max(SMALLEST, height + dy);
    if (!text && handle.includes('north')) {
      const next = Math.max(SMALLEST, height - dy);
      y += height - next;
      height = next;
    }

    return { ...layer, x, y, width, height };
  });
}

/**
 * A new document with one layer moved up or down the stack by one step. A
 * board nudging a title out from under a photograph is doing this, and one
 * step at a time is what makes it predictable.
 */
export function raiseLayer(poster, id, steps) {
  const at = poster.layers.findIndex(layer => layer.id === id);
  if (at === -1) return poster;
  const to = at + steps;
  if (to < 0 || to >= poster.layers.length) return poster;

  const layers = [...poster.layers];
  const [moved] = layers.splice(at, 1);
  layers.splice(to, 0, moved);
  return { ...poster, layers };
}

/** A new document with one layer taken off it. */
export function removeLayer(poster, id) {
  const layers = poster.layers.filter(layer => layer.id !== id);
  return layers.length === poster.layers.length ? poster : { ...poster, layers };
}

/**
 * A new document with a copy of one layer just above it, and offset, so that
 * the copy is visible rather than exactly behind what it was copied from.
 */
export function duplicateLayer(poster, id) {
  const at = poster.layers.findIndex(layer => layer.id === id);
  if (at === -1) return poster;

  const copy = held({
    ...poster.layers[at],
    id: nextId(),
    x: poster.layers[at].x + COPY_OFFSET,
    y: poster.layers[at].y + COPY_OFFSET,
  });
  const layers = [...poster.layers];
  layers.splice(at + 1, 0, copy);
  return { ...poster, layers };
}
