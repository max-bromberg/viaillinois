import { apiFetch } from './base.js';

/**
 * The tag list.
 *
 * Reading it is open, because the events feed's filter panel is. Adding and
 * removing are a global admin's, from the admin page.
 */
export const getTags = () => apiFetch('/api/v1/tags');

export const createTag = (tagName) =>
  apiFetch('/api/v1/tags', { method: 'POST', body: { tag_name: tagName } });

export const deleteTag = (tagName) =>
  apiFetch(`/api/v1/tags/${encodeURIComponent(tagName)}`, { method: 'DELETE' });
