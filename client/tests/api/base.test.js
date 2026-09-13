import { describe, it, expect, vi, beforeEach } from 'vitest';

global.fetch = vi.fn();
vi.mock('../../src/lib/router.js', () => ({ navigate: vi.fn(), currentPath: { subscribe: vi.fn() } }));

const { apiFetch } = await import('../../src/api/base.js');

describe('apiFetch()', () => {
  beforeEach(() => fetch.mockReset());

  it('calls fetch with credentials: include', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    await apiFetch('/api/v1/test');
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/test',
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('returns parsed JSON on success', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ events: [] }) });
    const result = await apiFetch('/api/v1/events');
    expect(result).toEqual({ events: [] });
  });

  it('throws on non-ok response', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Bad request' }),
    });
    await expect(apiFetch('/api/v1/events')).rejects.toThrow('Bad request');
  });

  it('navigates to /login on 401', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) });
    const { navigate } = await import('../../src/lib/router.js');
    try { await apiFetch('/api/v1/protected'); } catch { /* expected */ }
    expect(navigate).toHaveBeenCalledWith('/login');
  });
});

/**
 * Whether a failure carries a sentence the platform wrote.
 *
 * A surface wants to show a reader what actually went wrong, and the platform
 * writes a sentence for most of what can. When it does not, what is left is a
 * status code, and "HTTP 500" tells a reader nothing and reads like a crash, so
 * the failure says which of the two it is rather than every surface guessing
 * from the text.
 */
describe('what a failure says', () => {
  it('marks a sentence the platform wrote as one a reader can be shown', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: 'That search is too long.' }) });
    const failure = await apiFetch('/api/v1/events').catch(caught => caught);
    expect(failure.message).toBe('That search is too long.');
    expect(failure.said).toBe(true);
    expect(failure.status).toBe(400);
  });

  it('does not mark a status code as a sentence', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const failure = await apiFetch('/api/v1/events').catch(caught => caught);
    expect(failure.said).toBe(false);
  });
});
