<script>
  import { onMount, onDestroy } from 'svelte';
  import { generateNodes, generateSegments, spawnPulse, advancePulses } from './circuitGraph.js';

  // ── Config ────────────────────────────────────────────────────────────────
  const NODE_COUNT      = 55;
  const MIN_DIST        = 80;
  const K_CONNECTIONS   = 3;
  const BASE_SPAWN_RATE = 0.15;  // pulses per segment per second at rest
  const HOT_SPAWN_MULT  = 4;     // multiplier when segment is near mouse
  const HOVER_RADIUS    = 150;   // px — distance at which nodes become "hot"
  const HOTNESS_RISE    = 5.0;   // hotness units/second when cursor approaches
  const HOTNESS_FALL    = 2.5;   // hotness units/second when cursor leaves

  // Colours stored as [r, g, b, a] for fast per-frame interpolation
  const TRACE_BASE = [  0, 170, 175, 0.50];
  const TRACE_HOT  = [125, 248, 252, 0.95];
  const NODE_BASE  = [  0, 170, 175, 0.50];
  const NODE_HOT   = [125, 248, 252, 1.00];
  const PULSE_COL  = 'rgba(220,255,255,0.95)';

  // ── State ─────────────────────────────────────────────────────────────────
  let canvas;
  let ctx;
  let nodes    = [];
  let segments = [];
  let mouse    = { x: -9999, y: -9999 };
  let rafId;
  let lastTime = null;

  // ── Helpers ───────────────────────────────────────────────────────────────
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /** Interpolate between two [r,g,b,a] colour tuples and return an rgba() string. */
  function lerpRgba(c0, c1, t) {
    if (t <= 0) return `rgba(${c0[0]},${c0[1]},${c0[2]},${c0[3]})`;
    if (t >= 1) return `rgba(${c1[0]},${c1[1]},${c1[2]},${c1[3]})`;
    return `rgba(${Math.round(lerp(c0[0],c1[0],t))},` +
                `${Math.round(lerp(c0[1],c1[1],t))},` +
                `${Math.round(lerp(c0[2],c1[2],t))},` +
                `${lerp(c0[3],c1[3],t).toFixed(2)})`;
  }

  /** A segment's hotness is the maximum hotness of its two endpoint nodes. */
  function segHotness(seg) {
    return Math.max(
      nodes[seg.connectedNodes[0]]?.hotness ?? 0,
      nodes[seg.connectedNodes[1]]?.hotness ?? 0,
    );
  }

  // ── Initialise canvas and graph ───────────────────────────────────────────
  function init() {
    const dpr = window.devicePixelRatio || 1;
    const w   = window.innerWidth;
    const h   = window.innerHeight;

    canvas.width        = w * dpr;
    canvas.height       = h * dpr;
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';

    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // reset + scale for retina

    nodes    = generateNodes(w, h, NODE_COUNT, MIN_DIST);
    segments = generateSegments(nodes, K_CONNECTIONS);

    // Seed one pulse on every third segment so there is motion immediately
    segments.forEach((seg, i) => { if (i % 3 === 0) spawnPulse(seg); });
  }

  // ── RAF draw loop ─────────────────────────────────────────────────────────
  function draw(timestamp) {
    const dt = lastTime !== null
      ? Math.min((timestamp - lastTime) / 1000, 0.05) // cap at 50ms to avoid jumps after tab-switch
      : 0.016;
    lastTime = timestamp;

    const W = window.innerWidth;
    const H = window.innerHeight;

    // 1. Update per-node hotness toward mouse proximity target
    for (const node of nodes) {
      const dist   = Math.hypot(node.x - mouse.x, node.y - mouse.y);
      const target = dist < HOVER_RADIUS ? 1 : 0;
      const rate   = target > node.hotness ? HOTNESS_RISE : HOTNESS_FALL;
      node.hotness = Math.max(0, Math.min(1,
        node.hotness + (target - node.hotness) * rate * dt
      ));
    }

    // 2. Advance pulses and maybe spawn new ones
    advancePulses(segments, dt);
    for (const seg of segments) {
      const h    = segHotness(seg);
      const rate = BASE_SPAWN_RATE * lerp(1, HOT_SPAWN_MULT, h);
      if (Math.random() < rate * dt) spawnPulse(seg);
    }

    // 3. Render
    ctx.clearRect(0, 0, W, H);

    // Trace segments
    for (const seg of segments) {
      const h = segHotness(seg);
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.lineWidth   = lerp(1, 2.5, h);
      ctx.strokeStyle = lerpRgba(TRACE_BASE, TRACE_HOT, h);
      ctx.shadowColor = 'rgba(125,248,252,0.7)';
      ctx.shadowBlur  = lerp(0, 10, h);
      ctx.stroke();
    }
    ctx.shadowBlur  = 0;
    ctx.shadowColor = 'transparent';

    // Pulses (bright glowing dots travelling along segments)
    for (const seg of segments) {
      for (const pulse of seg.pulses) {
        const px = lerp(seg.x1, seg.x2, pulse.t);
        const py = lerp(seg.y1, seg.y2, pulse.t);
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fillStyle   = PULSE_COL;
        ctx.shadowColor = 'rgba(180,255,255,0.9)';
        ctx.shadowBlur  = 12;
        ctx.fill();
      }
    }
    ctx.shadowBlur  = 0;
    ctx.shadowColor = 'transparent';

    // Nodes
    for (const node of nodes) {
      const h = node.hotness;
      ctx.beginPath();
      ctx.arc(node.x, node.y, lerp(3, 7, h), 0, Math.PI * 2);
      ctx.fillStyle   = lerpRgba(NODE_BASE, NODE_HOT, h);
      ctx.shadowColor = 'rgba(125,248,252,0.9)';
      ctx.shadowBlur  = lerp(0, 16, h);
      ctx.fill();
    }
    ctx.shadowBlur  = 0;
    ctx.shadowColor = 'transparent';

    rafId = requestAnimationFrame(draw);
  }

  // ── Event handlers ────────────────────────────────────────────────────────
  function onMouseMove(e) {
    mouse = { x: e.clientX, y: e.clientY };
  }

  function onResize() {
    init();
    lastTime = null;
  }

  onMount(() => {
    init();
    rafId = requestAnimationFrame(draw);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('resize',    onResize);
  });

  onDestroy(() => {
    cancelAnimationFrame(rafId);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('resize',    onResize);
  });
</script>

<canvas
  bind:this={canvas}
  style="position:fixed;inset:0;z-index:0;pointer-events:none;"
/>
