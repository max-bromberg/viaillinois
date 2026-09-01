<script>
  import { onMount, onDestroy } from 'svelte';
  import {
    generateNodes, generateSegments, buildAdjacency,
    nearestNode, pointAt, probe, advanceSignals,
  } from './circuitGraph.js';

  /**
   * The board behind the page.
   *
   * At rest it does not move at all. A page that animates while you are trying
   * to read it is competing with its own content, and the previous version
   * spawned a pulse somewhere on screen roughly twenty five times a second.
   *
   * Touching it sends current out from the nearest pad, spreading through the
   * traces and fading as it goes, so every moving thing is where the cursor
   * already is and nowhere else.
   */

  // Sparse on purpose. Fewer pads, further apart, with fewer traces each.
  const NODE_COUNT    = 34;
  const MIN_DIST      = 120;
  const CONNECTIONS   = 2;

  const PROBE_RADIUS  = 210;   // how near the cursor has to be to touch a pad
  const REPROBE_MS    = 420;   // how often the same pad will fire again
  const SIGNAL_SPEED  = 520;   // px per second along a trace
  const DECAY         = 0.62;  // strength kept at each pad it reaches
  const MIN_STRENGTH  = 0.14;  // below this the current has run out
  const ENERGY_FALL   = 2.4;   // how quickly a lit pad goes dark again

  // Graphite at rest, Illinois orange when carrying current. One accent and
  // nothing else: the resting board is drawn from the theme's own foreground
  // colour so it sits correctly in both light and dark.
  const ACCENT        = [232, 74, 39];
  const TRACE_ALPHA   = 0.10;
  const PAD_ALPHA     = 0.15;

  let canvas;
  let ctx;
  let nodes = [];
  let segments = [];
  let adjacency = [];
  let signals = [];
  let foreground = '240 10% 3.9%';

  let mouse = { x: -9999, y: -9999 };
  let lastProbed = { id: null, at: 0 };
  let rafId = null;
  let lastTime = null;
  let lastWidth = 0;
  let resizeTimer;
  let themeWatcher;
  let reduced = false;

  const lerp = (a, b, t) => a + (b - a) * t;

  /** The resting colour, taken from the active theme so it works in both. */
  const restRgba = alpha => `hsl(${foreground} / ${alpha})`;

  /** A trace or pad carrying current, warming toward the accent. */
  const liveRgba = (energy, alpha) =>
    `rgba(${ACCENT[0]},${ACCENT[1]},${ACCENT[2]},${(alpha + energy * 0.75).toFixed(3)})`;

  function readTheme() {
    foreground = getComputedStyle(document.documentElement)
      .getPropertyValue('--foreground').trim() || foreground;
  }

  function init() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    nodes = generateNodes(w, h, NODE_COUNT, MIN_DIST);
    segments = generateSegments(nodes, CONNECTIONS);
    adjacency = buildAdjacency(nodes, segments);
    signals = [];
    draw(0);
  }

  /** Anything still lit or moving. When nothing is, the loop stops. */
  function isActive() {
    return signals.length > 0 || nodes.some(node => node.energy > 0.01);
  }

  function strokePath(points) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.stroke();
  }

  function render() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    // Traces. A trace is as bright as the brighter of the pads it joins.
    for (const segment of segments) {
      const energy = Math.max(nodes[segment.a]?.energy ?? 0, nodes[segment.b]?.energy ?? 0);
      ctx.lineWidth = lerp(1, 1.6, energy);
      ctx.strokeStyle = energy > 0.01 ? liveRgba(energy, TRACE_ALPHA) : restRgba(TRACE_ALPHA);
      strokePath(segment.points);
    }

    // Pads.
    for (const node of nodes) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, lerp(1.6, 3.4, node.energy), 0, Math.PI * 2);
      ctx.fillStyle = node.energy > 0.01
        ? liveRgba(node.energy, PAD_ALPHA)
        : restRgba(PAD_ALPHA);
      ctx.fill();
    }

    // The travelling signal. The only thing on the page that glows, and only
    // while it is moving.
    for (const signal of signals) {
      const segment = segments[signal.seg];
      if (!segment) continue;
      const [x, y] = pointAt(segment.points, signal.t);
      ctx.beginPath();
      ctx.arc(x, y, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${ACCENT[0]},${ACCENT[1]},${ACCENT[2]},${signal.strength.toFixed(2)})`;
      ctx.shadowColor = `rgba(${ACCENT[0]},${ACCENT[1]},${ACCENT[2]},0.55)`;
      ctx.shadowBlur = 14 * signal.strength;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    }
  }

  function draw(timestamp) {
    const dt = lastTime !== null ? Math.min((timestamp - lastTime) / 1000, 0.05) : 0.016;
    lastTime = timestamp;

    const advanced = advanceSignals(signals, segments, adjacency, dt, {
      speed: SIGNAL_SPEED, decay: DECAY, minStrength: MIN_STRENGTH,
    });
    signals = advanced.signals;
    for (const arrival of advanced.arrivals) {
      const node = nodes[arrival.node];
      if (node) node.energy = Math.max(node.energy, arrival.strength);
    }

    for (const node of nodes) {
      const next = node.energy - node.energy * ENERGY_FALL * dt;
      // Exponential decay never quite reaches zero, so it is snapped once it
      // is too faint to see. Otherwise the loop keeps running for seconds
      // after the last thing worth drawing has gone.
      node.energy = next < 0.02 ? 0 : next;
    }

    render();

    if (isActive()) {
      rafId = requestAnimationFrame(draw);
    } else {
      rafId = null;
      lastTime = null;
    }
  }

  function wake() {
    if (rafId === null) {
      lastTime = null;
      rafId = requestAnimationFrame(draw);
    }
  }

  function onMouseMove(event) {
    mouse = { x: event.clientX, y: event.clientY };
    const pad = nearestNode(nodes, mouse.x, mouse.y, PROBE_RADIUS);
    if (!pad) return;

    if (reduced) {
      // No propagation, no loop: the pad under the cursor simply lights up.
      for (const node of nodes) node.energy = 0;
      pad.energy = 1;
      render();
      return;
    }

    const now = performance.now();
    if (pad.id === lastProbed.id && now - lastProbed.at < REPROBE_MS) return;
    lastProbed = { id: pad.id, at: now };
    pad.energy = 1;
    signals = signals.concat(probe(pad.id, adjacency, 1));
    wake();
  }

  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (window.innerWidth !== lastWidth) {
        lastWidth = window.innerWidth;
        init();
      }
    }, 150);
  }

  /** A hidden tab should not be painting. The kiosk runs this for weeks. */
  function onVisibility() {
    if (document.hidden) {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      lastTime = null;
    } else if (isActive()) {
      wake();
    }
  }

  onMount(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduced = motionQuery.matches;
    const onMotionChange = e => { reduced = e.matches; };
    motionQuery.addEventListener('change', onMotionChange);

    readTheme();
    lastWidth = window.innerWidth;
    init();

    // The resting colour comes from the theme, so it has to be re-read when
    // the theme is switched.
    themeWatcher = new MutationObserver(() => { readTheme(); render(); });
    themeWatcher.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);

    return () => motionQuery.removeEventListener('change', onMotionChange);
  });

  onDestroy(() => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    clearTimeout(resizeTimer);
    themeWatcher?.disconnect();
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
  });
</script>

<!--
  Faded out through the middle, where the content column sits, so the board is
  something you notice at the edges of the page rather than something you read
  through.
-->
<canvas
  bind:this={canvas}
  aria-hidden="true"
  style="
    position:fixed; inset:0; z-index:0; pointer-events:none;
    -webkit-mask-image: radial-gradient(ellipse 62% 55% at 50% 42%, transparent 18%, black 92%);
    mask-image: radial-gradient(ellipse 62% 55% at 50% 42%, transparent 18%, black 92%);
  "
/>
