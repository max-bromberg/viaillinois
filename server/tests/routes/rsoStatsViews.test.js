import { describe, it, expect, vi, beforeEach } from 'vitest';

const callGetRSOStats = vi.hoisted(() => vi.fn());
const getInterestByRso = vi.hoisted(() => vi.fn());
const getFeedbackByRso = vi.hoisted(() => vi.fn());
const getViewsByRso = vi.hoisted(() => vi.fn());
const getViewTotalByRso = vi.hoisted(() => vi.fn());

vi.mock('../../db/queries/advanced.js', () => ({ callGetRSOStats }));
vi.mock('../../db/queries/eventInterest.ts', () => ({ getInterestByRso }));
vi.mock('../../db/queries/eventFeedback.ts', () => ({ getFeedbackByRso }));
vi.mock('../../db/queries/eventViews.ts', () => ({ getViewsByRso, getViewTotalByRso }));

const { getRsoStats } = await import('../../controllers/rsoStats.js');

const reply = () => {
  const res = { body: null, code: 200 };
  res.json = body => { res.body = body; return res; };
  res.status = code => { res.code = code; return res; };
  return res;
};

beforeEach(() => {
  vi.clearAllMocks();
  callGetRSOStats.mockResolvedValue({ members: [], tags: [] });
  getInterestByRso.mockResolvedValue([]);
  getFeedbackByRso.mockResolvedValue([]);
  getViewsByRso.mockResolvedValue([]);
  getViewTotalByRso.mockResolvedValue(0);
});

/**
 * Interest and feedback both arrive through the Discord bot, so a board whose
 * members are not on Discord opened this tab and read nothing but zeros. Views
 * are the one number the platform collects on its own, from the reading
 * somebody is already doing, so they are here beside the other two rather than
 * in place of them.
 */
describe('what a board reads about its own organization', () => {
  it('carries the readings of each event, and the total', async () => {
    getViewsByRso.mockResolvedValue([
      { eventId: 7, title: 'Design Review', startTime: '2026-09-20 18:00:00', viewCount: 41 },
      { eventId: 8, title: 'Socials', startTime: '2026-09-22 18:00:00', viewCount: 9 },
    ]);
    getViewTotalByRso.mockResolvedValue(50);

    const res = reply();
    await getRsoStats({ params: { id: '3' } }, res, () => {});

    expect(res.body.views).toEqual([
      { event_id: 7, title: 'Design Review', start_time: '2026-09-20 18:00:00', view_count: 41 },
      { event_id: 8, title: 'Socials', start_time: '2026-09-22 18:00:00', view_count: 9 },
    ]);
    expect(res.body.view_total).toBe(50);
  });

  it('keeps the interest and the feedback it already answered', async () => {
    const res = reply();
    await getRsoStats({ params: { id: '3' } }, res, () => {});
    expect(res.body.interest).toEqual([]);
    expect(res.body.feedback).toEqual([]);
  });

  it('reads them all at once rather than one after another', async () => {
    const res = reply();
    await getRsoStats({ params: { id: '3' } }, res, () => {});
    expect(getViewsByRso).toHaveBeenCalledWith(3, expect.anything());
    expect(getViewTotalByRso).toHaveBeenCalledWith(3, expect.anything());
  });

  it('refuses an organization that is not a number', async () => {
    const res = reply();
    await getRsoStats({ params: { id: 'three' } }, res, () => {});
    expect(res.code).toBe(400);
  });
});
