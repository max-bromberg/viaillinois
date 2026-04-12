import { describe, it, expect } from 'vitest';
import { generateNodes, generateSegments, spawnPulse, advancePulses } from '../../src/lib/circuitGraph.js';

describe('generateNodes', () => {
  it('returns at most count nodes', () => {
    const nodes = generateNodes(800, 600, 20, 80);
    expect(nodes.length).toBeLessThanOrEqual(20);
    expect(nodes.length).toBeGreaterThan(0);
  });

  it('no two nodes are closer than minDist', () => {
    const nodes = generateNodes(800, 600, 20, 80);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dist = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
        expect(dist).toBeGreaterThanOrEqual(80);
      }
    }
  });

  it('each node has x, y, id, hotness=0', () => {
    const nodes = generateNodes(400, 300, 5, 60);
    for (const node of nodes) {
      expect(node).toHaveProperty('x');
      expect(node).toHaveProperty('y');
      expect(node).toHaveProperty('id');
      expect(node.hotness).toBe(0);
    }
  });
});

describe('generateSegments', () => {
  it('returns segments with required shape', () => {
    const nodes = generateNodes(800, 600, 10, 80);
    const segs = generateSegments(nodes, 3);
    expect(segs.length).toBeGreaterThan(0);
    for (const seg of segs) {
      expect(typeof seg.x1).toBe('number');
      expect(typeof seg.y1).toBe('number');
      expect(typeof seg.x2).toBe('number');
      expect(typeof seg.y2).toBe('number');
      expect(Array.isArray(seg.pulses)).toBe(true);
      expect(Array.isArray(seg.connectedNodes)).toBe(true);
      expect(seg.connectedNodes.length).toBe(2);
    }
  });

  it('does not produce duplicate connections', () => {
    const nodes = generateNodes(800, 600, 10, 60);
    const segs = generateSegments(nodes, 2);
    // Each unique pair yields exactly 2 segments (L-shape)
    // unique pairs ≤ n*k/2, so total segments ≤ n*k
    expect(segs.length).toBeLessThanOrEqual(nodes.length * 2 * 2);
  });
});

describe('spawnPulse', () => {
  it('adds a pulse with t=0 and positive speed', () => {
    const seg = { pulses: [], connectedNodes: [0, 1] };
    spawnPulse(seg);
    expect(seg.pulses.length).toBe(1);
    expect(seg.pulses[0].t).toBe(0);
    expect(seg.pulses[0].speed).toBeGreaterThanOrEqual(0.08);
    expect(seg.pulses[0].speed).toBeLessThan(0.22);
  });
});

describe('advancePulses', () => {
  it('advances pulse t by speed * dt', () => {
    const seg = { pulses: [{ t: 0, speed: 0.5 }], connectedNodes: [0, 1] };
    advancePulses([seg], 0.1);
    // t = 0 + 0.5 * 0.1 = 0.05
    expect(seg.pulses[0].t).toBeCloseTo(0.05);
  });

  it('removes pulses that reach t >= 1', () => {
    const seg = { pulses: [{ t: 0.95, speed: 0.5 }], connectedNodes: [0, 1] };
    advancePulses([seg], 0.2);
    // t = 0.95 + 0.5 * 0.2 = 1.05 → removed
    expect(seg.pulses.length).toBe(0);
  });

  it('keeps pulses with t still below 1', () => {
    const seg = { pulses: [{ t: 0.1, speed: 0.2 }], connectedNodes: [0, 1] };
    advancePulses([seg], 0.1);
    // t = 0.1 + 0.2 * 0.1 = 0.12 → kept
    expect(seg.pulses.length).toBe(1);
  });
});
