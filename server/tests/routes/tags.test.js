import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * The tag list.
 *
 * The eight tags a board could put on an event were written into the event form
 * and into the filter panel, so adding one meant a release. The list is now
 * kept in the table that has always held it, and the pages that offer tags read
 * it. Adding and removing are a global admin's, because the list is one shared
 * vocabulary rather than one organization's, and it appears in the filter panel
 * of every reader on the site.
 */
const rows = vi.hoisted(() => ({ value: [] }));
vi.mock('../../db/queries/tags.js', () => ({
  allTags: vi.fn(async () => rows.value),
  createTag: vi.fn(async () => ({ created: true })),
  deleteTag: vi.fn(async () => ({ affectedRows: 1 })),
}));
vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(),
}));
vi.mock('../../db/queries/rso.js', () => ({
  getMembership: vi.fn(), getUserMemberships: vi.fn(async () => [{ rso_id: 1, role: 'Board' }]),
}));

const app = (await import('../../app.js')).default;
const tagsDb = await import('../../db/queries/tags.js');

const secret = process.env.JWT_SECRET || 'dev_secret';
const admin = `via_token=${jwt.sign({ net_id: 'admin1', is_global_admin: true }, secret)}`;
const board = `via_token=${jwt.sign({ net_id: 'board1', is_global_admin: false }, secret)}`;

beforeEach(() => {
  vi.clearAllMocks();
  rows.value = [
    { tag_name: 'Free Food', events: 12 },
    { tag_name: 'Workshop', events: 3 },
  ];
  tagsDb.createTag.mockResolvedValue({ created: true });
  tagsDb.deleteTag.mockResolvedValue({ affectedRows: 1 });
});

describe('GET /api/v1/tags', () => {
  it('is readable by anybody, because the filter panel is', async () => {
    const res = await request(app).get('/api/v1/tags');
    expect(res.status).toBe(200);
    expect(res.body.tags.map(t => t.tag_name)).toEqual(['Free Food', 'Workshop']);
  });

  it('says how many events carry each one, so removing one is an informed choice', async () => {
    const res = await request(app).get('/api/v1/tags');
    expect(res.body.tags[0].events).toBe(12);
  });
});

describe('POST /api/v1/tags', () => {
  const adding = (body, cookie = admin) =>
    request(app).post('/api/v1/tags').set('Cookie', cookie).send(body);

  it('adds a tag for a global admin', async () => {
    const res = await adding({ tag_name: 'Hackathon' });
    expect(res.status).toBe(201);
    expect(tagsDb.createTag).toHaveBeenCalledWith('Hackathon');
  });

  it('trims what was typed rather than storing the spaces around it', async () => {
    await adding({ tag_name: '  Hackathon  ' });
    expect(tagsDb.createTag).toHaveBeenCalledWith('Hackathon');
  });

  it('refuses a board member, because the list is not one organization\'s', async () => {
    const res = await adding({ tag_name: 'Hackathon' }, board);
    expect(res.status).toBe(403);
    expect(tagsDb.createTag).not.toHaveBeenCalled();
  });

  it('refuses an empty name', async () => {
    expect((await adding({ tag_name: '   ' })).status).toBe(400);
    expect(tagsDb.createTag).not.toHaveBeenCalled();
  });

  it('refuses a name longer than the column holds', async () => {
    expect((await adding({ tag_name: 'x'.repeat(51) })).status).toBe(400);
    expect(tagsDb.createTag).not.toHaveBeenCalled();
  });

  /**
   * The feed joins an event's tags into one string separated by commas, and the
   * event form splits them apart again on the same character. A tag with a
   * comma in it would come back as two tags that do not exist.
   */
  it('refuses a name with a comma in it', async () => {
    expect((await adding({ tag_name: 'Food, free' })).status).toBe(400);
    expect(tagsDb.createTag).not.toHaveBeenCalled();
  });

  it('says so when the tag is already there rather than reporting a new one', async () => {
    tagsDb.createTag.mockResolvedValue({ created: false });
    const res = await adding({ tag_name: 'Workshop' });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/v1/tags/:name', () => {
  it('removes a tag for a global admin', async () => {
    const res = await request(app).delete('/api/v1/tags/Workshop').set('Cookie', admin);
    expect(res.status).toBe(200);
    expect(tagsDb.deleteTag).toHaveBeenCalledWith('Workshop');
  });

  it('reads a name with a space in it out of the path', async () => {
    await request(app).delete('/api/v1/tags/Free%20Food').set('Cookie', admin);
    expect(tagsDb.deleteTag).toHaveBeenCalledWith('Free Food');
  });

  it('refuses a board member', async () => {
    const res = await request(app).delete('/api/v1/tags/Workshop').set('Cookie', board);
    expect(res.status).toBe(403);
    expect(tagsDb.deleteTag).not.toHaveBeenCalled();
  });

  it('says so when there was no such tag', async () => {
    tagsDb.deleteTag.mockResolvedValue({ affectedRows: 0 });
    const res = await request(app).delete('/api/v1/tags/Nothing').set('Cookie', admin);
    expect(res.status).toBe(404);
  });
});
