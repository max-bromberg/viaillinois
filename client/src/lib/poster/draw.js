import { fontFor } from './fonts.js';

/**
 * Drawing a poster document onto a canvas.
 *
 * One function draws a document, and both the preview on the screen and the
 * file that downloads go through it. Two renderings would drift apart the
 * first time either was edited, and a board that downloaded something other
 * than what they had been looking at would stop trusting the preview, which is
 * the whole of what makes a designer usable.
 *
 * Nothing here loads anything. An image and a link square both take a while to
 * arrive, and a drawing that waited would make every keystroke in the
 * inspector stutter, so the editor loads them and hands them in already drawn.
 * A layer whose picture has not arrived is left off rather than drawn as a
 * hole, because a black rectangle on a downloaded poster is worse than a gap
 * that fills a moment later.
 */

/** The face of a text layer, as a canvas wants it written. */
function fontOf(layer) {
  const face = fontFor(layer.fontKey);
  const slant = layer.italic ? 'italic ' : '';
  return `${slant}${layer.weight ?? 400} ${layer.fontSize}px ${face.css}`;
}

/**
 * The lines a block of text comes out as, broken where it runs past the width
 * of its box and where the person who typed it broke it themselves.
 */
export function wrapText(context, text, width) {
  const lines = [];
  for (const paragraph of String(text ?? '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && context.measureText(next).width > width) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** How tall one block of text comes out, which is its lines at its leading. */
function heightOf(context, layer) {
  context.font = fontOf(layer);
  const step = layer.fontSize * (layer.lineHeight ?? 1.2);
  return wrapText(context, layer.text, layer.width).length * step;
}

/**
 * How tall every block of text on a poster comes out, by layer.
 *
 * A block of text is as tall as its words rather than as tall as somebody
 * dragged it, so the handles around it, the box that catches a drag on it and
 * the layer list all read their height from here.
 */
export function textHeights(context, poster) {
  const heights = {};
  for (const layer of poster.layers) {
    if (layer.kind === 'text') heights[layer.id] = heightOf(context, layer);
  }
  return heights;
}

/** A rounded rectangle, or a plain one where no corner radius was asked for. */
function pathRectangle(context, x, y, width, height, radius) {
  if (!radius) {
    context.rect(x, y, width, height);
    return;
  }
  const r = Math.min(radius, width / 2, height / 2);
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function drawShape(context, layer) {
  context.beginPath();
  if (layer.shape === 'ellipse') {
    context.ellipse(
      layer.x + layer.width / 2, layer.y + layer.height / 2,
      layer.width / 2, layer.height / 2, 0, 0, Math.PI * 2,
    );
  } else if (layer.shape === 'line') {
    context.moveTo(layer.x, layer.y + layer.height / 2);
    context.lineTo(layer.x + layer.width, layer.y + layer.height / 2);
  } else {
    pathRectangle(context, layer.x, layer.y, layer.width, layer.height, layer.radius);
  }

  if (layer.shape !== 'line' && layer.fill) {
    context.fillStyle = layer.fill;
    context.fill();
  }
  if (layer.strokeWidth > 0 && layer.stroke) {
    context.strokeStyle = layer.stroke;
    context.lineWidth = layer.strokeWidth;
    context.stroke();
  }
}

function drawText(context, layer) {
  context.font = fontOf(layer);
  context.fillStyle = layer.color;
  context.textBaseline = 'top';
  if ('letterSpacing' in context) context.letterSpacing = `${layer.letterSpacing ?? 0}px`;

  const step = layer.fontSize * (layer.lineHeight ?? 1.2);
  const lines = wrapText(context, layer.text, layer.width);
  lines.forEach((line, index) => {
    const wide = context.measureText(line).width;
    const left = layer.align === 'center' ? layer.x + (layer.width - wide) / 2
      : layer.align === 'right' ? layer.x + layer.width - wide
        : layer.x;
    context.fillText(line, left, layer.y + index * step);
  });
  if ('letterSpacing' in context) context.letterSpacing = '0px';
}

/**
 * An image in its box, either filling it and cropped, or set inside it whole.
 * Filling is the one boards reach for, because a photograph with bands of
 * ground down either side is not what anybody means by putting it on a poster.
 */
function drawImage(context, layer, picture) {
  const shape = picture.naturalWidth / picture.naturalHeight;
  const box = layer.width / layer.height;
  context.save();
  context.beginPath();
  pathRectangle(context, layer.x, layer.y, layer.width, layer.height, layer.radius);
  context.clip();
  if (layer.opacity !== undefined) context.globalAlpha = layer.opacity;

  if (layer.fit === 'contain') {
    const width = shape > box ? layer.width : layer.height * shape;
    const height = shape > box ? layer.width / shape : layer.height;
    context.drawImage(
      picture,
      layer.x + (layer.width - width) / 2,
      layer.y + (layer.height - height) / 2,
      width, height,
    );
  } else {
    const width = shape > box ? layer.height * shape : layer.width;
    const height = shape > box ? layer.height : layer.width / shape;
    context.drawImage(
      picture,
      layer.x + (layer.width - width) / 2,
      layer.y + (layer.height - height) / 2,
      width, height,
    );
  }
  context.globalAlpha = 1;
  context.restore();
}

/**
 * Draw a whole document.
 *
 * @param context a canvas rendering context
 * @param poster the document, which is the ground and the stack of layers
 * @param assets the pictures and the link squares the editor has loaded, by
 *   the identifier of the layer each one belongs to
 */
export function drawPoster(context, poster, assets = {}) {
  const images = assets.images ?? {};
  const codes = assets.codes ?? {};

  context.fillStyle = poster.background;
  context.fillRect(0, 0, poster.width, poster.height);

  for (const layer of poster.layers) {
    if (layer.hidden) continue;

    const turned = Boolean(layer.rotation);
    if (turned) {
      // A layer turns about its own middle, which is what a person dragging a
      // rotation control means by it, so the canvas is moved there and back.
      context.save();
      context.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
      context.rotate((layer.rotation * Math.PI) / 180);
      context.translate(-(layer.x + layer.width / 2), -(layer.y + layer.height / 2));
    }

    if (layer.kind === 'shape') drawShape(context, layer);
    if (layer.kind === 'text') drawText(context, layer);
    if (layer.kind === 'image' && layer.src && images[layer.id]) {
      drawImage(context, layer, images[layer.id]);
    }
    if (layer.kind === 'qr' && codes[layer.id]) {
      context.drawImage(codes[layer.id], layer.x, layer.y, layer.width, layer.height);
    }

    if (turned) context.restore();
  }
}
