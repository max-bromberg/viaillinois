import { navigate } from '../lib/router.js';

/**
 * Base fetch wrapper. Attaches credentials (JWT cookie), parses JSON,
 * handles 401 redirects to /login.
 * @param {string} path - API path (e.g. '/api/v1/events')
 * @param {RequestInit} options
 * @returns {Promise<any>}
 */
export async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401 && !options.silentAuth) navigate('/login');
    const failure = new Error(data.error || `HTTP ${res.status}`);
    /*
     * Whether the sentence is one the platform wrote or one made up here from a
     * status code. A surface wants to show a reader what actually went wrong,
     * and "HTTP 500" tells a reader nothing and reads like a crash, so the
     * failure says which of the two it carries rather than every surface
     * guessing from the text.
     */
    failure.said = typeof data.error === 'string' && data.error !== '';
    failure.status = res.status;
    throw failure;
  }

  return data;
}
