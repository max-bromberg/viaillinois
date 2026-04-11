import { describe, it, expect } from 'vitest';
import { errorHandler } from '../../middleware/errorHandler.js';

function makeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json   = (body)  => { res.body = body; return res; };
  return res;
}

describe('errorHandler', () => {
  it('returns 500 with error message', () => {
    const err = new Error('Something broke');
    const res = makeRes();
    errorHandler(err, {}, res, () => {});
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Something broke');
  });

  it('uses err.status if set', () => {
    const err = Object.assign(new Error('Not found'), { status: 404 });
    const res = makeRes();
    errorHandler(err, {}, res, () => {});
    expect(res.statusCode).toBe(404);
  });

  it('hides stack in production', () => {
    process.env.NODE_ENV = 'production';
    const err = new Error('Internal');
    const res = makeRes();
    errorHandler(err, {}, res, () => {});
    expect(res.body.stack).toBeUndefined();
    process.env.NODE_ENV = 'test';
  });
});
