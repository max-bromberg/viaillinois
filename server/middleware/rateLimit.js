/**
 * Minimal in-memory fixed-window rate limiter.
 *
 * Intended for credential-bearing endpoints (login) to blunt brute-force and
 * credential-stuffing attacks. State is per-process: behind multiple instances
 * each replica enforces its own window, so this is a defense-in-depth measure,
 * not a substitute for an edge/WAF rate limit in large deployments.
 *
 * @param {{ windowMs?: number, max?: number, message?: string }} [opts]
 */
export function rateLimit({ windowMs = 15 * 60 * 1000, max = 10, message = 'Too many requests, please try again later' } = {}) {
  const hits = new Map(); // key -> { count, resetAt }

  // Periodically evict stale buckets so the map can't grow unbounded.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, windowMs);
  sweep.unref?.();

  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: message });
    }
    next();
  };
}
