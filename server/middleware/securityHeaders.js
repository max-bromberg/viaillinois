/**
 * Response headers that every web application is expected to send.
 *
 * Written out rather than pulled in as a dependency, for the same reason the
 * rate limiter next door is: the set that matters here is small, and a package
 * that turns on a content security policy by default would break the frontend
 * in ways that only show up in production.
 *
 * No content security policy is set. Doing that properly means enumerating
 * what the Svelte bundle and Tailwind actually load, and a policy written by
 * guesswork either blocks the site or permits everything. It is worth doing
 * deliberately and is noted in docs/deployment.md.
 */
export function securityHeaders(_req, res, next) {
  // Express sets this by default. Nothing is gained by telling the world which
  // framework this is. Removed here as well as disabled on the app, so that the
  // behaviour travels with the middleware rather than with one line of setup.
  res.removeHeader('X-Powered-By');

  // A response served as text must not be executed because it looks like script.
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // SAMEORIGIN rather than DENY: the kiosk is meant to be shown on a screen in
  // a building lobby, and may be embedded by another page of our own.
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // Send the origin, not the full path, to other sites people click through to.
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Production only. On a local instance there is no https, and a browser told
  // to force it will then refuse to load the development server, which is a
  // confusing thing to inflict on someone for a long time afterwards.
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}
