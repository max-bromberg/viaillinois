/**
 * The board behind the page.
 *
 * Pure geometry and signal propagation, with no DOM and no canvas, so the
 * behaviour can be tested without rendering anything.
 *
 * The model is a printed circuit board rather than a network diagram. Pads are
 * joined by traces that run horizontally and vertically with a chamfered
 * corner, the way a real board is routed, and nothing moves on its own.
 * Touching the board sends current out from the nearest pad, hop by hop,
 * fading as it spreads.
 *
 * Types:
 *   Node:    { id, x, y, energy }
 *   Segment: { id, a, b, points: [[x, y], ...], length }
 *   Signal:  { seg, from, to, t, strength }
 */

/** How far a corner is cut back, in pixels, when there is room for it. */
const CHAMFER = 14;

/**
 * Scatter pads across the viewport, keeping each at least minDist from the
 * rest. Returns fewer than asked for if there is no room.
 */
export function generateNodes(width, height, count, minDist, random = Math.random) {
  const nodes = [];
  const maxAttempts = count * 30;
  for (let attempt = 0; attempt < maxAttempts && nodes.length < count; attempt++) {
    const usableWidth = Math.max(0, width - 2 * minDist);
    const usableHeight = Math.max(0, height - 2 * minDist);
    const x = minDist + random() * usableWidth;
    const y = minDist + random() * usableHeight;
    if (nodes.every(n => Math.hypot(n.x - x, n.y - y) >= minDist)) {
      nodes.push({ id: nodes.length, x, y, energy: 0 });
    }
  }
  return nodes;
}

/** Total length of a polyline, which a signal travels at a constant speed. */
function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return total;
}

/**
 * Route a trace between two pads: along x, a 45 degree chamfer, then along y.
 *
 * The chamfer is the detail that makes this read as board routing. A trace
 * that turns a hard right angle is a manufacturing fault, so real boards cut
 * the corner, and the eye recognises it even without knowing why.
 */
function route(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (Math.abs(dx) < 1 || Math.abs(dy) < 1) {
    return [[from.x, from.y], [to.x, to.y]];
  }

  const chamfer = Math.min(CHAMFER, Math.abs(dx) / 2, Math.abs(dy) / 2);
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);

  return [
    [from.x, from.y],
    [to.x - sx * chamfer, from.y],
    [to.x, from.y + sy * chamfer],
    [to.x, to.y],
  ];
}

/** Join each pad to its k nearest neighbours, once per pair. */
export function generateSegments(nodes, k) {
  const segments = [];
  const seen = new Set();

  for (const node of nodes) {
    const nearest = nodes
      .filter(other => other.id !== node.id)
      .sort((a, b) =>
        Math.hypot(a.x - node.x, a.y - node.y) - Math.hypot(b.x - node.x, b.y - node.y))
      .slice(0, k);

    for (const other of nearest) {
      const pair = [node.id, other.id].sort((a, b) => a - b).join('-');
      if (seen.has(pair)) continue;
      seen.add(pair);

      const points = route(node, other);
      segments.push({
        id: segments.length,
        a: node.id,
        b: other.id,
        points,
        length: pathLength(points),
      });
    }
  }
  return segments;
}

/** For each pad, the traces leaving it and where each one leads. */
export function buildAdjacency(nodes, segments) {
  const adjacency = nodes.map(() => []);
  for (const segment of segments) {
    adjacency[segment.a]?.push({ seg: segment.id, to: segment.b });
    adjacency[segment.b]?.push({ seg: segment.id, to: segment.a });
  }
  return adjacency;
}

/** The pad nearest a point, or nothing when the point is out of reach. */
export function nearestNode(nodes, x, y, maxDist) {
  let best = null;
  let bestDist = maxDist;
  for (const node of nodes) {
    const dist = Math.hypot(node.x - x, node.y - y);
    if (dist <= bestDist) {
      best = node;
      bestDist = dist;
    }
  }
  return best;
}

/** Where along a polyline a fraction t falls, following the corners. */
export function pointAt(points, t) {
  if (t <= 0) return [points[0][0], points[0][1]];
  const last = points[points.length - 1];
  if (t >= 1) return [last[0], last[1]];

  const total = pathLength(points);
  let travelled = t * total;

  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const leg = Math.hypot(x1 - x0, y1 - y0);
    if (travelled <= leg) {
      const f = leg === 0 ? 0 : travelled / leg;
      return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
    }
    travelled -= leg;
  }
  return [last[0], last[1]];
}

/** Send current out from a pad along every trace leaving it. */
export function probe(nodeId, adjacency, strength) {
  return (adjacency[nodeId] ?? []).map(edge => ({
    seg: edge.seg,
    from: nodeId,
    to: edge.to,
    t: 0,
    strength,
  }));
}

/**
 * Move every signal along its trace, and spread onward from any pad reached.
 *
 * A signal never turns back down the trace it arrived on, and loses strength
 * at each pad, so one touch produces a spreading front that runs out rather
 * than a board that stays lit.
 *
 * @returns {{signals: Array, arrivals: Array<{node: number, strength: number}>}}
 */
export function advanceSignals(signals, segments, adjacency, dt, options) {
  const { speed, decay, minStrength } = options;
  const next = [];
  const arrivals = [];

  for (const signal of signals) {
    const segment = segments[signal.seg];
    if (!segment) continue;

    const t = signal.t + (speed * dt) / segment.length;
    if (t < 1) {
      next.push({ ...signal, t });
      continue;
    }

    arrivals.push({ node: signal.to, strength: signal.strength });

    const onward = signal.strength * decay;
    if (onward < minStrength) continue;
    for (const edge of adjacency[signal.to] ?? []) {
      if (edge.seg === signal.seg) continue;
      next.push({ seg: edge.seg, from: signal.to, to: edge.to, t: 0, strength: onward });
    }
  }

  return { signals: next, arrivals };
}
