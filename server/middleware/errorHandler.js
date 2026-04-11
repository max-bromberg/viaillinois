/**
 * Global Express error handler.
 * Catches errors passed via next(err) from any route.
 */
export function errorHandler(err, _req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const body = { error: err.message || 'Internal server error' };
  if (process.env.NODE_ENV !== 'production') {
    body.stack = err.stack;
  }
  res.status(status).json(body);
}
