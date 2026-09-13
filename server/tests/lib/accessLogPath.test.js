import { describe, it, expect } from 'vitest';
import { redactedUrl } from '../../lib/accessLogPath.js';

/**
 * The access log is read by people and kept by machines, so anything in an
 * address that would let the reader act as somebody else has to be taken out
 * before the line is written. Three addresses carry such a thing.
 */
describe('redactedUrl', () => {
  it('leaves an ordinary address alone', () => {
    expect(redactedUrl('/api/v1/events?rsoIds=1,2')).toBe('/api/v1/events?rsoIds=1,2');
    expect(redactedUrl('/')).toBe('/');
  });

  it('takes the personal calendar token out of the address', () => {
    expect(redactedUrl('/calendar/personal/QK7wQe9r2sT4uV6xY8zA1bC3dE5fG7hJ9kL0mN2pQ4s.ics'))
      .toBe('/calendar/personal/[token].ics');
  });

  it('takes the calendar token out even when a query string follows it', () => {
    expect(redactedUrl('/calendar/personal/QK7wQe9r2sT4uV6xY8zA1bC3dE5fG7hJ9kL0mN2pQ4s.ics?refresh=1'))
      .toBe('/calendar/personal/[token].ics');
  });

  it('takes the whole query string off the Discord callback, code and state alike', () => {
    expect(redactedUrl('/auth/discord/callback?code=a-code&state=a-state'))
      .toBe('/auth/discord/callback');
  });

  it('takes the link session identifier out of the page address', () => {
    expect(redactedUrl('/link/discord/hLbQ2mXk9wR4tYu7iOp1aSdFgHjKlZxCvBnM3qWe5rT'))
      .toBe('/link/discord/[session]');
    expect(redactedUrl('/link/discord/hLbQ2mXk9wR4tYu7iOp1aSdFgHjKlZxCvBnM3qWe5rT/done'))
      .toBe('/link/discord/[session]/done');
  });

  it('takes the link session identifier out of the address the page reads', () => {
    expect(redactedUrl('/api/v1/link/discord/hLbQ2mXk9wR4tYu7iOp1aSdFgHjKlZxCvBnM3qWe5rT'))
      .toBe('/api/v1/link/discord/[session]');
  });

  it('answers something for an address that is missing or is not text', () => {
    expect(redactedUrl(undefined)).toBe('-');
    expect(redactedUrl(null)).toBe('-');
  });
});
