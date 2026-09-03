import { describe, it, expect } from 'vitest';
import { sendBusy, sendBudgetExhausted, BUSY_MESSAGE, BUDGET_MESSAGE, busyHtml } from '../../lib/busyResponse.js';

function fakeResponse() {
  const recorded = { headers: {}, status: null, body: null, type: null };
  return {
    recorded,
    set(name, value) { recorded.headers[name] = value; return this; },
    status(code) { recorded.status = code; return this; },
    json(body) { recorded.body = body; return this; },
    type(value) { recorded.type = value; return this; },
    send(body) { recorded.body = body; return this; },
  };
}

/**
 * A refusal has to tell the reader two things: that VIA is still there, and
 * when to come back. Both are said in complete sentences, because a student
 * who followed a link to an event is the person reading this.
 */
describe('sendBusy', () => {
  it('answers 503 with the retry window in both the header and the body', () => {
    const res = fakeResponse();
    sendBusy(res, 30);
    expect(res.recorded.status).toBe(503);
    expect(res.recorded.headers['Retry-After']).toBe('30');
    expect(res.recorded.body).toEqual({ error: BUSY_MESSAGE, retry_after_seconds: 30 });
  });

  it('says it in a complete sentence', () => {
    expect(BUSY_MESSAGE).toBe('VIA is busy right now. Please try again in a moment.');
  });
});

describe('sendBudgetExhausted', () => {
  it('answers 429, because the caller may retry and nothing is broken', () => {
    const res = fakeResponse();
    sendBudgetExhausted(res, 60);
    expect(res.recorded.status).toBe(429);
    expect(res.recorded.headers['Retry-After']).toBe('60');
    expect(res.recorded.body).toEqual({ error: BUDGET_MESSAGE, retry_after_seconds: 60 });
  });

  it('blames the pace rather than the reader', () => {
    expect(BUDGET_MESSAGE)
      .toBe('You are reading VIA faster than we can serve everyone. Please try again in a minute.');
  });
});

describe('busyHtml', () => {
  it('carries the same sentence, for somebody who followed a link', () => {
    expect(busyHtml()).toContain(BUSY_MESSAGE);
  });

  it('needs nothing from the network, because the network is the problem', () => {
    expect(busyHtml()).not.toMatch(/<script|<link|src=/);
  });
});
