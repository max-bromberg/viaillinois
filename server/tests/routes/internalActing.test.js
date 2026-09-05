import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../services/denialRecorder.js', () => ({
  recordDenial: vi.fn(),
  startDenialRecorder: vi.fn(), stopDenialRecorder: vi.fn(),
  flushDenials: vi.fn(), bufferSize: () => 0, resetRecorder: vi.fn(),
}));

const linksDb = vi.hoisted(() => ({
  getLinkByDiscordUserId: vi.fn(), getLinkByNetId: vi.fn(), getLinkWithMemberships: vi.fn(),
  openLinkSession: vi.fn(), getLinkSession: vi.fn(), completeLinkSession: vi.fn(),
  linkAccount: vi.fn(), setLinkAuthorization: vi.fn(),
  deleteLinkByDiscordUserId: vi.fn(), deleteLinkByNetId: vi.fn(),
  SESSION_MINUTES: 10,
}));
vi.mock('../../db/queries/discordLinks.ts', () => linksDb);

vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(),
}));

const rsoDb = vi.hoisted(() => ({
  getUserMemberships: vi.fn(), getMembership: vi.fn(), getAllRsos: vi.fn(), getRsoById: vi.fn(),
  addMember: vi.fn(), removeMember: vi.fn(), createRso: vi.fn(), deleteRso: vi.fn(), updateRso: vi.fn(),
}));
vi.mock('../../db/queries/rso.js', () => rsoDb);

const eventsDb = vi.hoisted(() => ({
  getEventById: vi.fn(), getPublicEvents: vi.fn(), countPublicEvents: vi.fn(),
  getAllEvents: vi.fn(), countAllEvents: vi.fn(), getVisibleEvents: vi.fn(), countVisibleEvents: vi.fn(),
  getEventsByRso: vi.fn(), getKioskEvents: vi.fn(), createEvent: vi.fn(), updateEvent: vi.fn(),
  deleteEvent: vi.fn(), setEventTags: vi.fn(), findEventsByUid: vi.fn(),
  TIMEFRAMES: ['upcoming', 'archived', 'all'],
}));
vi.mock('../../db/queries/events.js', () => eventsDb);

const seriesDb = vi.hoisted(() => ({
  busyInRoom: vi.fn(), createSeriesWithOccurrences: vi.fn(), getSeriesById: vi.fn(),
  findSeriesByUid: vi.fn(), occurrencesOfSeries: vi.fn(), detachEvent: vi.fn(),
  applyToSeries: vi.fn(), setTagsForEvents: vi.fn(), deleteOccurrencesFrom: vi.fn(),
  syncSeriesEnd: vi.fn(), deleteSeries: vi.fn(), updateSeriesRule: vi.fn(),
}));
vi.mock('../../db/queries/eventSeries.js', () => seriesDb);

const checkConflict = vi.hoisted(() => vi.fn());
vi.mock('../../services/conflictDetector.js', () => ({
  checkConflict, occupiedLocationIds: vi.fn().mockResolvedValue(new Set()),
}));

const recommend = vi.hoisted(() => vi.fn());
vi.mock('../../services/intelligentScheduler.js', () => ({ recommend }));

const interestDb = vi.hoisted(() => ({
  getInterestByRso: vi.fn().mockResolvedValue([]),
  setInterest: vi.fn(), clearInterest: vi.fn(), countInterest: vi.fn(),
}));
vi.mock('../../db/queries/eventInterest.ts', () => interestDb);

const feedbackDb = vi.hoisted(() => ({
  saveFeedback: vi.fn(), getFeedbackByRso: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../db/queries/eventFeedback.ts', () => feedbackDb);

const outboxWriters = vi.hoisted(() => ({
  recordEventUpdated: vi.fn(), recordEventCancelled: vi.fn(), recordSeriesCreated: vi.fn(),
}));
vi.mock('../../db/queries/outbox.ts', async () => ({
  ...(await import('../support/outboxMock.js')).outboxMock(),
  ...outboxWriters,
}));

vi.mock('../../services/linkedRoles.js', () => ({
  clearFacts: vi.fn(), pushFacts: vi.fn(), registerMetadata: vi.fn(),
  isConfigured: () => true, METADATA_SCHEMA: [], PLATFORM_NAME: 'VIA',
}));

const TOKEN = 'a'.repeat(64);
process.env.BOT_SERVICE_TOKEN = TOKEN;
process.env.CLIENT_URL = 'https://viaillinois.com';
process.env.DISCORD_INTEREST_SALT = 'a-long-random-salt';

const app = (await import('../../app.js')).default;

const EDITOR = '204255221017214977';
const MEMBER = '204255221017214988';
const UNLINKED = '999999999999999999';

const asBot = (method, path) => request(app)[method](path).set('Authorization', `Bearer ${TOKEN}`);
const acting = (method, path, discordUserId = EDITOR) =>
  asBot(method, path).set('X-Via-Acting-Discord-User', discordUserId);

const EVENT = {
  event_id: 10, rso_id: 4, rso_name: 'IEEE Student Branch', title: 'General meeting',
  description: 'Bring a laptop.', start_time: '2026-09-10 18:00:00', end_time: '2026-09-10 19:00:00',
  is_private: 0, cancelled_at: null, location_id: 5, building: 'Electrical & Computer Eng Bldg',
  room_number: '1002', location_text: null, location_note: null,
  series_id: null, detached: 0, interest_count: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  linksDb.getLinkByDiscordUserId.mockImplementation(async id => {
    if (id === EDITOR) return { netId: 'rgarcia7', isGlobalAdmin: 0 };
    if (id === MEMBER) return { netId: 'jchen4', isGlobalAdmin: 0 };
    return null;
  });
  rsoDb.getMembership.mockImplementation(async netId =>
    (netId === 'rgarcia7' ? { role: 'Editor' } : { role: 'Member' }));
  rsoDb.getUserMemberships.mockResolvedValue([{ rso_id: 4, role: 'Editor' }]);
  eventsDb.getEventById.mockResolvedValue({ ...EVENT });
  eventsDb.updateEvent.mockResolvedValue({ affectedRows: 1 });
  checkConflict.mockResolvedValue(null);
  interestDb.countInterest.mockResolvedValue(4);
  feedbackDb.saveFeedback.mockResolvedValue(undefined);
  recommend.mockResolvedValue({ recommendations: [], considered: 0 });
  seriesDb.createSeriesWithOccurrences.mockResolvedValue({ seriesId: 7, eventIds: [10, 11] });
});

/**
 * The three answers every acting endpoint owes.
 *
 * The bot never decides any of this. It presents the Discord account it saw,
 * the web platform resolves it to a NetID and applies the rules the dashboard
 * applies, and the bot turns each refusal into its own wording from the code
 * beside the sentence.
 */
function refusesTheUnentitled(send) {
  it('refuses somebody who is only a member of that organization', async () => {
    const res = await send(MEMBER);
    expect(res.status).toBe(403);
    expect(res.body).toEqual(expect.objectContaining({ error: expect.any(String), code: 'forbidden' }));
  });

  it('refuses a Discord account nobody linked', async () => {
    const res = await send(UNLINKED);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('not_linked');
  });

  it('refuses a request that acts as nobody', async () => {
    const res = await send(null);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('unauthorized');
  });
}

describe('POST /internal/v1/events/{id}/postpone', () => {
  const send = (who, body = { start_time: '2026-09-17 18:00:00', end_time: '2026-09-17 19:00:00' }) => {
    const req = who === null
      ? asBot('post', '/internal/v1/events/10/postpone')
      : acting('post', '/internal/v1/events/10/postpone', who);
    return req.send(body);
  };

  it('moves the event and answers with it in the shape the bot reads', async () => {
    eventsDb.getEventById
      .mockResolvedValueOnce({ ...EVENT })
      .mockResolvedValueOnce({ ...EVENT })
      .mockResolvedValue({ ...EVENT, start_time: '2026-09-17 18:00:00', end_time: '2026-09-17 19:00:00' });
    const res = await send(EDITOR);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.event).toEqual(expect.objectContaining({
      event_id: 10,
      start_time: '2026-09-17T18:00:00-05:00',
      end_time: '2026-09-17T19:00:00-05:00',
    }));
  });

  it('keeps everything it was not asked to change', async () => {
    await send(EDITOR);
    expect(eventsDb.updateEvent).toHaveBeenCalledWith(10, expect.objectContaining({
      title: 'General meeting',
      description: 'Bring a laptop.',
      location_id: 5,
      start_time: '2026-09-17 18:00:00',
      end_time: '2026-09-17 19:00:00',
    }));
  });

  it('decides with the acting person and records the change for them', async () => {
    await send(EDITOR);
    expect(rsoDb.getMembership).toHaveBeenCalledWith('rgarcia7', 4);
    expect(outboxWriters.recordEventUpdated).toHaveBeenCalled();
  });

  it('carries the reason into the entry the bot reads', async () => {
    await send(EDITOR, {
      start_time: '2026-09-17 18:00:00', end_time: '2026-09-17 19:00:00',
      reason: 'The room flooded.',
    });
    expect(outboxWriters.recordEventUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ event_id: 10 }),
      expect.objectContaining({ reason: 'The room flooded.' })
    );
  });

  it('refuses a room somebody else has taken', async () => {
    checkConflict.mockResolvedValue({ event_id: 99 });
    const res = await send(EDITOR);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('conflict');
    expect(eventsDb.updateEvent).not.toHaveBeenCalled();
  });

  it('refuses a reason longer than the column holds', async () => {
    const res = await send(EDITOR, {
      start_time: '2026-09-17 18:00:00', end_time: '2026-09-17 19:00:00',
      reason: 'x'.repeat(501),
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid');
    expect(eventsDb.updateEvent).not.toHaveBeenCalled();
  });

  it('refuses times it cannot read, and an end before the start', async () => {
    for (const body of [
      { start_time: 'next tuesday', end_time: '2026-09-17 19:00:00' },
      { start_time: '2026-09-17 18:00:00' },
      { start_time: '2026-09-17 19:00:00', end_time: '2026-09-17 18:00:00' },
    ]) {
      const res = await send(EDITOR, body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('invalid');
    }
    expect(eventsDb.updateEvent).not.toHaveBeenCalled();
  });

  it('answers 404 for an event that is not there', async () => {
    eventsDb.getEventById.mockResolvedValue(null);
    const res = await send(EDITOR);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
  });

  refusesTheUnentitled(who => send(who));
});

describe('POST /internal/v1/events/{id}/cancel and restore', () => {
  const send = (who, path = '/internal/v1/events/10/cancel') =>
    (who === null ? asBot('post', path) : acting('post', path, who)).send({});

  it('cancels for an editor and says when', async () => {
    const res = await send(EDITOR);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.cancelled_at).toEqual(expect.any(String));
    expect(outboxWriters.recordEventCancelled).toHaveBeenCalledWith(10);
  });

  it('puts a cancelled event back', async () => {
    eventsDb.getEventById.mockResolvedValue({ ...EVENT, cancelled_at: '2026-09-05 09:00:00' });
    const res = await send(EDITOR, '/internal/v1/events/10/restore');
    expect(res.status).toBe(200);
    expect(res.body.cancelled_at).toBeNull();
    expect(eventsDb.updateEvent).toHaveBeenCalledWith(10, { cancelled_at: null });
  });

  refusesTheUnentitled(who => send(who));
});

describe('PATCH /internal/v1/events/{id}', () => {
  const send = (who, body = { description: 'Bring two laptops.' }) => {
    const req = who === null
      ? asBot('patch', '/internal/v1/events/10')
      : acting('patch', '/internal/v1/events/10', who);
    return req.send(body);
  };

  it('changes the description, the privacy and the location note', async () => {
    const res = await send(EDITOR, {
      description: 'Bring two laptops.', is_private: true, location_note: 'Use the north entrance.',
    });
    expect(res.status).toBe(200);
    expect(eventsDb.updateEvent).toHaveBeenCalledWith(10, expect.objectContaining({
      description: 'Bring two laptops.',
      is_private: true,
      location_note: 'Use the north entrance.',
      title: 'General meeting',
      start_time: '2026-09-10 18:00:00',
    }));
    expect(res.body.event).toEqual(expect.objectContaining({ event_id: 10 }));
  });

  it('leaves the note alone when the request does not mention it', async () => {
    await send(EDITOR, { description: 'Bring two laptops.' });
    const [, updates] = eventsDb.updateEvent.mock.calls[0];
    expect('location_note' in updates).toBe(false);
  });

  it('refuses a field this endpoint does not accept', async () => {
    for (const body of [{ title: 'Renamed' }, { start_time: '2026-09-17 18:00:00' }, { rso_id: 9 }]) {
      const res = await send(EDITOR, body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('invalid');
    }
    expect(eventsDb.updateEvent).not.toHaveBeenCalled();
  });

  it('refuses a value the column cannot hold', async () => {
    for (const body of [
      { is_private: 'yes' },
      { description: 42 },
      { location_note: ['north'] },
    ]) {
      const res = await send(EDITOR, body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('invalid');
    }
    expect(eventsDb.updateEvent).not.toHaveBeenCalled();
  });

  it('takes a description and a note cleared to nothing', async () => {
    const res = await send(EDITOR, { description: null, location_note: null });
    expect(res.status).toBe(200);
    expect(eventsDb.updateEvent).toHaveBeenCalledWith(10, expect.objectContaining({
      description: null, location_note: null,
    }));
  });

  it('refuses a request that changes nothing at all', async () => {
    const res = await send(EDITOR, {});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid');
  });

  refusesTheUnentitled(who => send(who));
});

describe('POST /internal/v1/scheduler/recommend', () => {
  const body = {
    rso_id: 4,
    durationMinutes: 60,
    dateRange: { start: '2026-09-14', end: '2026-09-21' },
  };
  const send = (who, sent = body) => {
    const req = who === null
      ? asBot('post', '/internal/v1/scheduler/recommend')
      : acting('post', '/internal/v1/scheduler/recommend', who);
    return req.send(sent);
  };

  it('asks the same scheduler the dashboard asks', async () => {
    recommend.mockResolvedValue({ recommendations: [{ start: '2026-09-16 18:00:00', score: 91 }] });
    const res = await send(EDITOR);
    expect(res.status).toBe(200);
    expect(res.body.recommendations).toHaveLength(1);
    expect(recommend).toHaveBeenCalledWith(expect.objectContaining({
      durationMinutes: 60,
      dateRange: { start: '2026-09-14', end: '2026-09-21' },
    }));
  });

  it('refuses a range that is the wrong way round', async () => {
    const res = await send(EDITOR, { ...body, dateRange: { start: '2026-09-21', end: '2026-09-14' } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid');
  });

  it('refuses a body with no organization in it', async () => {
    const res = await send(EDITOR, { durationMinutes: 60, dateRange: body.dateRange });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid');
  });

  refusesTheUnentitled(who => send(who));
});

describe('POST /internal/v1/events/series', () => {
  const body = {
    rso_id: 4, title: 'Weekly meeting', start_time: '2026-09-14 18:00:00', end_time: '2026-09-14 19:00:00',
    recurrence: { frequency: 'weekly', intervalWeeks: 1, daysOfWeek: ['MO'], until: '2026-10-12' },
  };
  const send = (who, sent = body) => {
    const req = who === null
      ? asBot('post', '/internal/v1/events/series')
      : acting('post', '/internal/v1/events/series', who);
    return req.send(sent);
  };

  it('creates the repeat as the acting person', async () => {
    const res = await send(EDITOR);
    expect(res.status).toBe(201);
    expect(res.body).toEqual(expect.objectContaining({ series_id: 7, created: 2 }));
    expect(seriesDb.createSeriesWithOccurrences).toHaveBeenCalledWith(expect.objectContaining({
      series: expect.objectContaining({ rso_id: 4, created_by: 'rgarcia7' }),
      event: expect.objectContaining({ created_by: 'rgarcia7' }),
    }));
  });

  refusesTheUnentitled(who => send(who));
});

/**
 * Interest is the count that replaced the RSVPs. A linked person is counted by
 * their NetID, and anybody else by a salted hash of the Discord identifier the
 * bot saw, which is never stored in the clear and never answered back.
 */
describe('PUT /internal/v1/events/{id}/interest', () => {
  it('records interest for a linked person under their NetID', async () => {
    const res = await acting('put', '/internal/v1/events/10/interest').send({ interested: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, interest_count: 4 });
    expect(interestDb.setInterest).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 10, subject: 'rgarcia7',
    }));
  });

  it('clears it again, and says the count after the change', async () => {
    interestDb.countInterest.mockResolvedValue(3);
    const res = await acting('put', '/internal/v1/events/10/interest').send({ interested: false });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, interest_count: 3 });
    expect(interestDb.clearInterest).toHaveBeenCalledWith({ eventId: 10, subject: 'rgarcia7' });
    expect(interestDb.setInterest).not.toHaveBeenCalled();
  });

  it('is the same answer when it is set twice', async () => {
    const first = await acting('put', '/internal/v1/events/10/interest').send({ interested: true });
    const second = await acting('put', '/internal/v1/events/10/interest').send({ interested: true });
    expect(second.body).toEqual(first.body);
    expect(interestDb.setInterest).toHaveBeenCalledTimes(2);
  });

  it('records interest for somebody who has not linked, under a hash', async () => {
    const res = await asBot('put', '/internal/v1/events/10/interest')
      .send({ interested: true, discord_user_id: '204255221017214977' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, interest_count: 4 });
    const [{ subject }] = interestDb.setInterest.mock.calls[0];
    expect(subject.startsWith('h:')).toBe(true);
    expect(subject).not.toContain('204255221017214977');
    expect(subject.length).toBeLessThanOrEqual(64);
    expect(JSON.stringify(res.body)).not.toContain(subject.slice(2));
  });

  it('gives the same person the same subject every time, and two people different ones', async () => {
    await asBot('put', '/internal/v1/events/10/interest')
      .send({ interested: true, discord_user_id: '204255221017214977' });
    await asBot('put', '/internal/v1/events/10/interest')
      .send({ interested: true, discord_user_id: '204255221017214977' });
    await asBot('put', '/internal/v1/events/10/interest')
      .send({ interested: true, discord_user_id: '204255221017214988' });
    const [a, b, c] = interestDb.setInterest.mock.calls.map(([call]) => call.subject);
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });

  it('prefers the acting person over an identifier in the body', async () => {
    await acting('put', '/internal/v1/events/10/interest')
      .send({ interested: true, discord_user_id: '204255221017214988' });
    expect(interestDb.setInterest).toHaveBeenCalledWith(expect.objectContaining({ subject: 'rgarcia7' }));
  });

  it('refuses a request that names nobody at all', async () => {
    const res = await asBot('put', '/internal/v1/events/10/interest').send({ interested: true });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid');
    expect(interestDb.setInterest).not.toHaveBeenCalled();
  });

  it('refuses a body that does not say whether they are interested', async () => {
    const res = await acting('put', '/internal/v1/events/10/interest').send({ interested: 'yes' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid');
  });

  it('answers 404 for an event that is not there', async () => {
    eventsDb.getEventById.mockResolvedValue(null);
    const res = await acting('put', '/internal/v1/events/10/interest').send({ interested: true });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
  });

  it('answers not found for an internal event the acting person may not see', async () => {
    // An interest count on an event somebody cannot see is a way of learning
    // that the event exists, and of being counted at a meeting they were never
    // shown. The reading endpoints already refuse this, so the acting ones do
    // the same, with the same answer.
    eventsDb.getEventById.mockResolvedValue({ ...EVENT, rso_id: 9, is_private: 1 });
    const res = await acting('put', '/internal/v1/events/10/interest').send({ interested: true });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
    expect(interestDb.setInterest).not.toHaveBeenCalled();
  });

  it('answers not found for an internal event when nobody has linked to see it', async () => {
    eventsDb.getEventById.mockResolvedValue({ ...EVENT, rso_id: 9, is_private: 1 });
    const res = await asBot('put', '/internal/v1/events/10/interest')
      .send({ interested: true, discord_user_id: '204255221017214977' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
    expect(interestDb.setInterest).not.toHaveBeenCalled();
  });

  it('records interest on an internal event for a member of that organization', async () => {
    eventsDb.getEventById.mockResolvedValue({ ...EVENT, is_private: 1 });
    const res = await acting('put', '/internal/v1/events/10/interest').send({ interested: true });
    expect(res.status).toBe(200);
    expect(interestDb.setInterest).toHaveBeenCalled();
  });

  /**
   * A deployment with no salt cannot record this at all, and it will not be
   * able to a moment later either. Answering busy told the bot to try again,
   * which it does for ever. This is a misconfiguration of the web platform, so
   * it is answered as one and the sentence names the setting.
   */
  it('refuses to hash with no salt rather than hashing with an empty one', async () => {
    const salt = process.env.DISCORD_INTEREST_SALT;
    delete process.env.DISCORD_INTEREST_SALT;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const res = await asBot('put', '/internal/v1/events/10/interest')
        .send({ interested: true, discord_user_id: '204255221017214977' });
      expect(res.status).toBe(500);
      expect(res.body.code).toBe('invalid');
      expect(res.body.error).toContain('DISCORD_INTEREST_SALT');
      expect(interestDb.setInterest).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('DISCORD_INTEREST_SALT'));
    } finally {
      warn.mockRestore();
      process.env.DISCORD_INTEREST_SALT = salt;
    }
  });
});

describe('POST /internal/v1/events/{id}/feedback', () => {
  const send = (who, body = { rating: 5, comment: 'The pizza arrived on time.' }) => {
    const req = who === null
      ? asBot('post', '/internal/v1/events/10/feedback')
      : acting('post', '/internal/v1/events/10/feedback', who);
    return req.send(body);
  };

  it('records a rating and a comment for the acting person', async () => {
    const res = await send(EDITOR);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(feedbackDb.saveFeedback).toHaveBeenCalledWith({
      eventId: 10, netId: 'rgarcia7', rating: 5, comment: 'The pizza arrived on time.',
    });
  });

  it('takes a rating with no comment', async () => {
    await send(EDITOR, { rating: 3 });
    expect(feedbackDb.saveFeedback).toHaveBeenCalledWith({
      eventId: 10, netId: 'rgarcia7', rating: 3, comment: null,
    });
  });

  it('is open to anybody signed in, not only to a board', async () => {
    const res = await send(MEMBER);
    expect(res.status).toBe(200);
    expect(feedbackDb.saveFeedback).toHaveBeenCalledWith(expect.objectContaining({ netId: 'jchen4' }));
  });

  it('refuses a rating outside one to five', async () => {
    for (const rating of [0, 6, 2.5, '5', null, undefined]) {
      const res = await send(EDITOR, { rating });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('invalid');
    }
    expect(feedbackDb.saveFeedback).not.toHaveBeenCalled();
  });

  it('refuses a comment longer than a comment box holds', async () => {
    const res = await send(EDITOR, { rating: 4, comment: 'x'.repeat(1001) });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid');
    expect(feedbackDb.saveFeedback).not.toHaveBeenCalled();
  });

  it('refuses a Discord account nobody linked', async () => {
    const res = await send(UNLINKED);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('not_linked');
  });

  it('refuses a request that acts as nobody', async () => {
    const res = await send(null);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('unauthorized');
  });

  it('answers 404 for an event that is not there', async () => {
    eventsDb.getEventById.mockResolvedValue(null);
    const res = await send(EDITOR);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
  });

  it('answers not found for an internal event the acting person may not see', async () => {
    eventsDb.getEventById.mockResolvedValue({ ...EVENT, rso_id: 9, is_private: 1 });
    const res = await send(EDITOR);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
    expect(feedbackDb.saveFeedback).not.toHaveBeenCalled();
  });

  it('records feedback on an internal event for a member of that organization', async () => {
    eventsDb.getEventById.mockResolvedValue({ ...EVENT, is_private: 1 });
    const res = await send(EDITOR);
    expect(res.status).toBe(200);
    expect(feedbackDb.saveFeedback).toHaveBeenCalled();
  });
});
