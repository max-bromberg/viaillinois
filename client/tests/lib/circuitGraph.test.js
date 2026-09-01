import { describe, it, expect } from 'vitest';
import {
  generateNodes, generateSegments, buildAdjacency, nearestNode,
  pointAt, probe, advanceSignals,
} from '../../src/lib/circuitGraph.js';

const grid = () => {
  // Four pads in a square, far enough apart to route between.
  const nodes = [
    { id: 0, x:   0, y:   0, energy: 0 },
    { id: 1, x: 200, y:   0, energy: 0 },
    { id: 2, x:   0, y: 200, energy: 0 },
    { id: 3, x: 200, y: 200, energy: 0 },
  ];
  return { nodes, segments: generateSegments(nodes, 2) };
};

describe('generateNodes', () => {
  it('returns at most the count asked for', () => {
    expect(generateNodes(800, 600, 20, 50).length).toBeLessThanOrEqual(20);
  });

  it('keeps every pad at least minDist from every other', () => {
    const nodes = generateNodes(800, 600, 20, 60);
    for (const a of nodes) {
      for (const b of nodes) {
        if (a.id !== b.id) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(60);
      }
    }
  });

  it('gives every pad an identity, a position and no energy', () => {
    for (const node of generateNodes(400, 400, 5, 40)) {
      expect(node).toMatchObject({ energy: 0 });
      expect(Number.isFinite(node.x) && Number.isFinite(node.y)).toBe(true);
      expect(Number.isInteger(node.id)).toBe(true);
    }
  });
});

describe('generateSegments', () => {
  /**
   * A trace turns a corner the way it does on a real board: two right angles
   * would be a manufacturing fault, so the corner is chamfered at 45 degrees.
   * That single detail is what makes the drawing read as board routing rather
   * than as a generic network diagram.
   */
  it('routes a corner with a 45 degree chamfer rather than a right angle', () => {
    const nodes = [
      { id: 0, x: 0, y: 0, energy: 0 },
      { id: 1, x: 100, y: 60, energy: 0 },
    ];
    const [segment] = generateSegments(nodes, 1);
    expect(segment.points).toHaveLength(4);

    const [, before, after] = segment.points;
    const dx = after[0] - before[0];
    const dy = after[1] - before[1];
    expect(Math.abs(Math.abs(dx) - Math.abs(dy))).toBeLessThan(0.001);
  });

  it('runs a straight trace when the pads share an axis', () => {
    const nodes = [
      { id: 0, x: 0, y: 0, energy: 0 },
      { id: 1, x: 100, y: 0, energy: 0 },
    ];
    const [segment] = generateSegments(nodes, 1);
    expect(segment.points).toHaveLength(2);
  });

  it('starts at one pad and ends at the other', () => {
    const { segments } = grid();
    for (const segment of segments) {
      const nodes = grid().nodes;
      expect(segment.points[0]).toEqual([nodes[segment.a].x, nodes[segment.a].y]);
      expect(segment.points.at(-1)).toEqual([nodes[segment.b].x, nodes[segment.b].y]);
    }
  });

  it('connects each pair once, however many neighbours are asked for', () => {
    const { segments } = grid();
    const pairs = segments.map(s => [s.a, s.b].sort().join('-'));
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('measures each trace so a signal can travel it at a constant speed', () => {
    for (const segment of grid().segments) expect(segment.length).toBeGreaterThan(0);
  });
});

describe('pointAt', () => {
  const points = [[0, 0], [10, 0], [10, 10]];

  it('is at the start at nothing and the end at one', () => {
    expect(pointAt(points, 0)).toEqual([0, 0]);
    expect(pointAt(points, 1)).toEqual([10, 10]);
  });

  it('follows the corners rather than cutting across them', () => {
    expect(pointAt(points, 0.5)).toEqual([10, 0]);
  });

  it('stays on the path for values outside the range', () => {
    expect(pointAt(points, -1)).toEqual([0, 0]);
    expect(pointAt(points, 2)).toEqual([10, 10]);
  });
});

describe('nearestNode', () => {
  it('finds the closest pad within reach', () => {
    const { nodes } = grid();
    expect(nearestNode(nodes, 10, 10, 100).id).toBe(0);
  });

  it('finds nothing when the cursor is nowhere near the board', () => {
    const { nodes } = grid();
    expect(nearestNode(nodes, 1000, 1000, 100)).toBeNull();
  });
});

describe('probe', () => {
  it('sends a signal out along every trace leaving the pad', () => {
    const { nodes, segments } = grid();
    const adjacency = buildAdjacency(nodes, segments);
    const signals = probe(0, adjacency, 1);
    expect(signals.length).toBe(adjacency[0].length);
    expect(signals.every(s => s.from === 0 && s.t === 0 && s.strength === 1)).toBe(true);
  });

  it('sends nothing from a pad that is connected to nothing', () => {
    expect(probe(0, [[]], 1)).toEqual([]);
  });
});

describe('advanceSignals', () => {
  const setup = () => {
    const { nodes, segments } = grid();
    return { nodes, segments, adjacency: buildAdjacency(nodes, segments) };
  };
  const options = { speed: 400, decay: 0.6, minStrength: 0.1 };

  it('moves a signal along its trace', () => {
    const { segments, adjacency } = setup();
    const signals = [{ seg: 0, from: segments[0].a, to: segments[0].b, t: 0, strength: 1 }];
    const { signals: moved } = advanceSignals(signals, segments, adjacency, 0.1, options);
    expect(moved[0].t).toBeGreaterThan(0);
    expect(moved[0].t).toBeLessThan(1);
  });

  /**
   * Arriving at a pad is what spreads the current onward, and it is also what
   * lights the pad up. Without the arrival report the pads would stay dark
   * while signals ran past them.
   */
  it('reports the pad a signal reaches', () => {
    const { segments, adjacency } = setup();
    const signals = [{ seg: 0, from: segments[0].a, to: segments[0].b, t: 0.99, strength: 1 }];
    const { arrivals } = advanceSignals(signals, segments, adjacency, 1, adjacency, options);
    expect(arrivals[0].node).toBe(segments[0].b);
  });

  it('spreads onward from the pad it reaches, weaker each hop', () => {
    const { segments, adjacency } = setup();
    const signals = [{ seg: 0, from: segments[0].a, to: segments[0].b, t: 0.99, strength: 1 }];
    const { signals: next } = advanceSignals(signals, segments, adjacency, 1, options);
    expect(next.length).toBeGreaterThan(0);
    expect(next.every(s => s.strength < 1)).toBe(true);
  });

  it('never sends a signal back the way it came', () => {
    const { segments, adjacency } = setup();
    const signals = [{ seg: 0, from: segments[0].a, to: segments[0].b, t: 0.99, strength: 1 }];
    const { signals: next } = advanceSignals(signals, segments, adjacency, 1, options);
    expect(next.every(s => s.seg !== 0)).toBe(true);
  });

  /** Current has to run out, or one touch would light the board forever. */
  it('stops once a signal is too weak to matter', () => {
    const { segments, adjacency } = setup();
    const signals = [{ seg: 0, from: segments[0].a, to: segments[0].b, t: 0.99, strength: 0.12 }];
    const { signals: next } = advanceSignals(signals, segments, adjacency, 1, options);
    expect(next).toEqual([]);
  });

  it('leaves an empty board empty', () => {
    const { segments, adjacency } = setup();
    expect(advanceSignals([], segments, adjacency, 1, options)).toEqual({ signals: [], arrivals: [] });
  });
});
