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
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return data;
}
