import { describe, it, expect, vi } from 'vitest';
import { withErrorCode, codeForStatus, ERROR_CODES } from '../../lib/apiError.js';

/** A response that records what was sent through whatever res.json is now. */
function makeRes() {
  const res = { statusCode: 200, sent: null };
  res.status = code => { res.statusCode = code; return res; };
  res.json = body => { res.sent = body; return res; };
  return res;
}

describe('codeForStatus', () => {
  it('names the code that belongs with each refusal the shared middleware makes', () => {
    expect(codeForStatus(401)).toBe(ERROR_CODES.UNAUTHORIZED);
    expect(codeForStatus(403)).toBe(ERROR_CODES.FORBIDDEN);
    expect(codeForStatus(418)).toBe(ERROR_CODES.INVALID);
  });
});

/**
 * The wrapper exists to put a machine readable code on a refusal that one of
 * the website's own middlewares wrote. It replaces res.json to do that, and
 * what it replaces has to be put back: a middleware that lets the request
 * through leaves everything after it answering through a wrapper meant for the
 * middleware, and a second wrapper on the same request nests inside the first.
 */
describe('withErrorCode', () => {
  it('puts the code on the refusal the middleware wrote', () => {
    const res = makeRes();
    withErrorCode((_req, r) => r.status(403).json({ error: 'RSO editor access required' }))(
      {}, res, vi.fn());
    expect(res.sent).toEqual({ error: 'RSO editor access required', code: 'forbidden' });
  });

  it('leaves a body that already carries a code alone', () => {
    const res = makeRes();
    withErrorCode((_req, r) => r.status(404).json({ error: 'Gone.', code: 'not_found' }))(
      {}, res, vi.fn());
    expect(res.sent).toEqual({ error: 'Gone.', code: 'not_found' });
  });

  it('puts res.json back once the middleware has answered', () => {
    const res = makeRes();
    const before = res.json;
    withErrorCode((_req, r) => r.status(403).json({ error: 'No.' }))({}, res, vi.fn());
    expect(res.json).toBe(before);
  });

  it('puts res.json back when the middleware lets the request through', () => {
    const res = makeRes();
    const before = res.json;
    const next = vi.fn();
    withErrorCode((_req, _r, onwards) => onwards())({}, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.json).toBe(before);
  });

  it('does not put a code on what a later handler answers with', () => {
    // The route this guards answers in its own shape, which may be the public
    // API's shape with no code at all, and the wrapper has no business
    // rewriting it.
    const res = makeRes();
    withErrorCode((_req, _r, onwards) => onwards())({}, res, () => {
      res.status(409).json({ error: 'Location is already booked for this time' });
    });
    expect(res.sent).toEqual({ error: 'Location is already booked for this time' });
  });

  it('carries an error the middleware passed to next straight on', () => {
    const res = makeRes();
    const next = vi.fn();
    const boom = new Error('the database is away');
    withErrorCode((_req, _r, onwards) => onwards(boom))({}, res, next);
    expect(next).toHaveBeenCalledWith(boom);
    expect(res.json).toBeTypeOf('function');
  });
});
