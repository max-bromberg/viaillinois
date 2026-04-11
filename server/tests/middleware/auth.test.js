import { describe, it, expect, vi } from 'vitest';

// Mock passport and query modules before importing auth
vi.mock('passport', () => ({ default: { initialize: vi.fn(() => (_,__,next) => next()), authenticate: vi.fn() } }));
vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(),
  upsertUser: vi.fn(),
  getLocalAccount: vi.fn(),
}));

const { requireAuth, requireGlobalAdmin } = await import('../../middleware/auth.js');

function makeReq(user = null) {
  return { user, cookies: {} };
}
function makeRes() {
  const r = {}; r.status = vi.fn(() => r); r.json = vi.fn(() => r); return r;
}

describe('requireAuth', () => {
  it('calls next() when user is present', () => {
    const next = vi.fn();
    requireAuth(makeReq({ net_id: 'mbrom3' }), makeRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('returns 401 when no user', () => {
    const res = makeRes();
    requireAuth(makeReq(null), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('requireGlobalAdmin', () => {
  it('calls next() when user is global admin', () => {
    const next = vi.fn();
    requireGlobalAdmin(makeReq({ net_id: 'a', is_global_admin: true }), makeRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('returns 403 when not admin', () => {
    const res = makeRes();
    requireGlobalAdmin(makeReq({ net_id: 'a', is_global_admin: false }), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
