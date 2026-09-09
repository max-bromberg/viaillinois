import { readable } from 'svelte/store';
import { getTags } from '../api/tags.js';

/**
 * The tags an event may carry.
 *
 * These were written into the event form and into the events feed's filter
 * panel, as two copies of the same array, so adding one meant a release. The
 * list is kept by the platform now and read here once for every page that
 * offers tags, rather than fetched again by each of them.
 */

/**
 * What the platform shipped with, and what stands in when the list cannot be
 * read. A board halfway through describing an event should not be left with no
 * tags at all because one request failed.
 */
export const FALLBACK_TAGS = [
  'Free Food', 'Workshop', 'Social', 'Corporate',
  'Competition', 'Weekly Meeting', 'Speaker', 'Networking',
];

/** The list, as names, newest reading first and the fallback until one arrives. */
export const tagNames = readable(FALLBACK_TAGS, set => {
  let live = true;
  getTags()
    .then(({ tags }) => {
      if (!live) return;
      const names = (tags ?? []).map(tag => tag.tag_name).filter(Boolean);
      if (names.length > 0) set(names);
    })
    .catch(() => { /* the fallback is already what the store holds */ });
  return () => { live = false; };
});
