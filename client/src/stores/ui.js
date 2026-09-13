import { writable } from 'svelte/store';

export const isLoading  = writable(false);
export const modalOpen  = writable(false);
export const modalContent = writable(null); // { component, props }
export const toast      = writable(null);   // { message, type: 'success'|'error' }

/**
 * The title of the page being read.
 *
 * docs/design/08-surfaces.md puts a reading page's title in the sky band, in
 * place of the greeting. The page knows what its title is and the band knows how
 * to set one, and neither is in a position to tell the other, so the title
 * travels between them here rather than every reading page being threaded
 * through the router.
 */
export const pageTitle = writable(null);

/**
 * Whether the band is showing that title. A reading page draws its own heading
 * when the band is not, so that no surface ends up with no heading at all.
 */
export const bandShowsTitle = writable(false);

export function showToast(message, type = 'success', durationMs = 3000) {
  toast.set({ message, type });
  setTimeout(() => toast.set(null), durationMs);
}
