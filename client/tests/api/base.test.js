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
