import { describe, it, expect, vi } from 'vitest';

vi.mock('passport', () => ({ default: { initialize: vi.fn(() => (_, __, next) => next()), authenticate: vi.fn() } }));
vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(),
}));
const getMembership = vi.hoisted(() => vi.fn());
vi.mock('../../db/queries/rso.js', () => ({ getMembership }));

const { createActingUser } = await import('../../middleware/actingUser.js');
const { requireRSOEditor, requireAuth } = await import('../../middleware/auth.js');

function fakeResponse() {
  const recorded = { status: null, body: null };
  return {
    recorded,
    status(c) { recorded.status = c; return this; },
    json(b) { recorded.body = b; return this; },
  };
}

const LINKS = {
  '123456789012345678': { netId: 'alice', isGlobalAdmin: 0 },
  '223456789012345678': { netId: 'root', isGlobalAdmin: 1 },
};
const resolveLink = vi.fn(async id => LINKS[id] ?? null);
const acting = createActingUser({ resolveLink });

const req = (discordUserId) => ({
  headers: discordUserId === undefined ? {} : { 'x-via-acting-discord-user': discordUserId },
  params: { id: '7' },
});

/**
 * The bot reports the Discord identifier it observed and never a NetID. This
 * turns that identifier into the same req.user the cookie produces, so every
 * authorization check the dashboard relies on applies unchanged to Discord.
 */
describe('createActingUser', () => {
  it('leaves the request as the service itself when no acting header is present', async () => {
    const r = req(undefined);
    const next = vi.fn();
    await acting(r, fakeResponse(), next);
    expect(next).toHaveBeenCalledWith();
    expect(r.user).toBeUndefined();
  });

  it('sets req.user to the linked person, in the shape the cookie produces', async () => {
    const r = req('123456789012345678');
    await acting(r, fakeResponse(), vi.fn());
    expect(r.user).toEqual({ net_id: 'alice', is_global_admin: false });
  });

  it('carries the global administrator flag as a boolean', async () => {
    const r = req('223456789012345678');
    await acting(r, fakeResponse(), vi.fn());
    expect(r.user.is_global_admin).toBe(true);
  });

  it('refuses an identifier with no link, naming the reason so the bot can offer linking', async () => {
    const res = fakeResponse();
    const next = vi.fn();
    await acting(req('999999999999999999'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.recorded.status).toBe(403);
    expect(res.recorded.body.code).toBe('not_linked');
    expect(res.recorded.body.error).toMatch(/not linked/i);
  });

  it('refuses an identifier that is not a Discord snowflake without asking the database', async () => {
    resolveLink.mockClear();
    const res = fakeResponse();
    await acting(req("1 OR 1=1"), res, vi.fn());
    expect(res.recorded.status).toBe(400);
    expect(res.recorded.body.code).toBe('invalid');
    expect(resolveLink).not.toHaveBeenCalled();
  });

  it('hands a lookup failure to the error handler rather than answering', async () => {
    const failing = createActingUser({ resolveLink: async () => { throw new Error('ECONNREFUSED'); } });
    const next = vi.fn();
    await failing(req('123456789012345678'), fakeResponse(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('the existing authorization middleware, applied to an acting person', () => {
  it('requireAuth accepts a linked person', async () => {
    const r = req('123456789012345678');
    await acting(r, fakeResponse(), vi.fn());
    const next = vi.fn();
    requireAuth(r, fakeResponse(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('requireRSOEditor accepts a linked editor of the RSO', async () => {
    getMembership.mockResolvedValue({ net_id: 'alice', rso_id: 7, role: 'Editor' });
    const r = req('123456789012345678');
    await acting(r, fakeResponse(), vi.fn());
    await new Promise(resolve => requireRSOEditor(r, fakeResponse(), resolve));
    expect(getMembership).toHaveBeenCalledWith('alice', 7);
  });

  it('requireRSOEditor refuses a linked member of the RSO', async () => {
    getMembership.mockResolvedValue({ net_id: 'alice', rso_id: 7, role: 'Member' });
    const r = req('123456789012345678');
    await acting(r, fakeResponse(), vi.fn());
    const res = fakeResponse();
    const done = new Promise(resolve => { res.json = b => { res.recorded.body = b; resolve(); return res; }; });
    requireRSOEditor(r, res, vi.fn());
    await done;
    expect(res.recorded.status).toBe(403);
  });
});
