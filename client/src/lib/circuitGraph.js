/**
 * Pure graph logic for the circuit background animation.
 * No DOM, no canvas — all functions are independently testable.
 *
 * Types:
 *   Node:    { x, y, id, hotness }
 *   Segment: { x1, y1, x2, y2, pulses: Pulse[], connectedNodes: [number, number] }
 *   Pulse:   { t, speed }
 */

/**
 * Scatter `count` nodes across a canvas of `width`×`height`,
 * keeping each node at least `minDist` px from all others.
 * Returns fewer nodes if the canvas is too small to fit all of them.
 */
export function generateNodes(width, height, count, minDist) {
  const nodes = [];
  let attempts = 0;
  const maxAttempts = count * 30;
  while (nodes.length < count && attempts < maxAttempts) {
    attempts++;
    const usableW = Math.max(0, width  - 2 * minDist);
    const usableH = Math.max(0, height - 2 * minDist);
    const x = minDist + Math.random() * usableW;
    const y = minDist + Math.random() * usableH;
    if (nodes.every(n => Math.hypot(n.x - x, n.y - y) >= minDist)) {
      nodes.push({ x, y, id: nodes.length, hotness: 0 });
    }
  }
  return nodes;
}

/**
 * Connect each node to its `k` nearest neighbours using orthogonal L-shaped
 * paths. Each logical pair produces exactly 2 axis-aligned segments.
 * Duplicate pairs are skipped via a seen-set.
 */
export function generateSegments(nodes, k) {
  const segments = [];
  const seen = new Set();

  for (const node of nodes) {
    const nearest = [...nodes]
      .filter(n => n.id !== node.id)
      .sort((a, b) =>
        Math.hypot(a.x - node.x, a.y - node.y) -
        Math.hypot(b.x - node.x, b.y - node.y)
      )
      .slice(0, k);

    for (const other of nearest) {
      const key = `${Math.min(node.id, other.id)}-${Math.max(node.id, other.id)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Randomly choose L-shape orientation for visual variety
      const corner = Math.random() < 0.5
        ? { x: other.x, y: node.y }   // horizontal-first
        : { x: node.x,  y: other.y }; // vertical-first

      segments.push({ x1: node.x,   y1: node.y,   x2: corner.x, y2: corner.y, pulses: [], connectedNodes: [node.id, other.id] });
      segments.push({ x1: corner.x, y1: corner.y, x2: other.x,  y2: other.y,  pulses: [], connectedNodes: [node.id, other.id] });
    }
  }
  return segments;
}

/**
 * Append a new pulse to `segment.pulses`.
 * Speed is randomised so pulses travel at varying rates.
 */
export function spawnPulse(segment) {
  segment.pulses.push({
    t:     0,
    speed: 0.08 + Math.random() * 0.14, // t-units/second → ~7–22s end-to-end per segment
  });
}

/**
 * Advance every pulse across all segments by `dt` seconds.
 * Pulses that reach t ≥ 1.0 are removed (they exit the segment).
 */
export function advancePulses(segments, dt) {
  for (const seg of segments) {
    for (const p of seg.pulses) p.t += p.speed * dt;
    seg.pulses = seg.pulses.filter(p => p.t < 1.0);
  }
}
