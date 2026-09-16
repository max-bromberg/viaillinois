import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * A link doing the rounds is one render, not one render per reader.
 *
 * Renders are serialised so that two pasted links cannot open two browsers
 * inside a container with a memory ceiling. Serialising is not the same as
 * sharing: every caller that arrived before the first render finished missed
 * the cache, because the cache is only written at the end, and queued an
 * identical render of its own behind it. Discord, Slack, iMessage and a reader's
 * own browser all fetch a pasted link independently and none of them share a
 * cold edge entry, so the first link posted anywhere is a queue of identical
 * renders, each of the order of a second, with an Express request held open for
 * every one.
 *
 * A render also has to be able to give up. The page settle had no timeout at
 * all, so one page that never finished settling would hold the queue for the
 * life of the process and every card on the site would stop being drawn.
 */
const screenshot = vi.fn();
const pages = [];

function stubPage() {
  const page = {
    setContent: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(undefined),
    screenshot,
    close: vi.fn().mockResolvedValue(undefined),
  };
  pages.push(page);
  return page;
}

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      isConnected: () => true,
      newPage: vi.fn(async () => stubPage()),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

let renderCard;
let resetCardCache;

const EVENT = {
  event_id: 42, title: 'Weekly meeting', rso_name: 'IEEE',
  start_time: '2026-10-01 19:00:00', building: 'Electrical & Computer Eng Bldg',
  room_number: '1002', cancelled_at: null,
};

beforeEach(async () => {
  pages.length = 0;
  screenshot.mockReset();
  screenshot.mockImplementation(async () => {
    await new Promise(resolve => setTimeout(resolve, 20));
    return Buffer.from('89504e470d0a1a0a', 'hex');
  });
  ({ renderCard, resetCardCache } = await import('../../services/cardImage.js'));
  await resetCardCache();
});

afterEach(async () => { await resetCardCache(); });

describe('drawing the same card for several callers at once', () => {
  it('draws it once and hands the one picture to all of them', async () => {
    const answers = await Promise.all(Array.from({ length: 12 }, () => renderCard(EVENT)));

    expect(screenshot).toHaveBeenCalledTimes(1);
    expect(answers.every(png => png === answers[0])).toBe(true);
  });

  it('draws a different card separately, because it is a different picture', async () => {
    await Promise.all([renderCard(EVENT), renderCard({ ...EVENT, event_id: 43, title: 'Other' })]);
    expect(screenshot).toHaveBeenCalledTimes(2);
  });

  it('answers from what it holds once the first render is done', async () => {
    await renderCard(EVENT);
    await renderCard(EVENT);
    expect(screenshot).toHaveBeenCalledTimes(1);
  });

  it('does not hold on to a render that failed', async () => {
    screenshot.mockRejectedValueOnce(new Error('the page would not settle'));
    await expect(renderCard(EVENT)).rejects.toThrow('the page would not settle');

    screenshot.mockResolvedValueOnce(Buffer.from('89504e470d0a1a0a', 'hex'));
    await expect(renderCard(EVENT)).resolves.toBeInstanceOf(Buffer);
  });

  it('lets every caller of a failed render hear about it rather than hanging', async () => {
    screenshot.mockRejectedValue(new Error('the page would not settle'));
    const answers = await Promise.allSettled([renderCard(EVENT), renderCard(EVENT), renderCard(EVENT)]);
    expect(answers.every(one => one.status === 'rejected')).toBe(true);
  });
});

describe('a render that will not finish', () => {
  it('gives up rather than holding the queue for the life of the process', async () => {
    process.env.CARD_RENDER_TIMEOUT_MS = '60';
    vi.resetModules();
    ({ renderCard, resetCardCache } = await import('../../services/cardImage.js'));
    await resetCardCache();
    screenshot.mockImplementation(() => new Promise(() => {}));

    await expect(renderCard(EVENT)).rejects.toThrow(/too long|timed out/i);

    delete process.env.CARD_RENDER_TIMEOUT_MS;
  }, 15000);

  it('draws the next card normally once it has given up on one', async () => {
    process.env.CARD_RENDER_TIMEOUT_MS = '60';
    vi.resetModules();
    ({ renderCard, resetCardCache } = await import('../../services/cardImage.js'));
    await resetCardCache();

    screenshot.mockImplementationOnce(() => new Promise(() => {}));
    await expect(renderCard(EVENT)).rejects.toThrow();

    screenshot.mockImplementation(async () => Buffer.from('89504e470d0a1a0a', 'hex'));
    await expect(renderCard({ ...EVENT, event_id: 44 })).resolves.toBeInstanceOf(Buffer);

    delete process.env.CARD_RENDER_TIMEOUT_MS;
  }, 15000);
});
