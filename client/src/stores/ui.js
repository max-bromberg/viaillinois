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

/**
 * Say what just happened.
 *
 * docs/design/07-components.md gives a toast six seconds, and gives an error
 * none at all, because a sentence saying the feed did not load should still be
 * there when the reader looks up. The lifetime travels with the toast and the
 * Toast component keeps the timer, so that the setting the chrome asks for is
 * the setting a reader gets. This used to keep a three second timer of its own
 * as well, which emptied the store underneath the component and made every
 * toast a three second flash, an error included.
 *
 * @param {string} message what happened
 * @param {'success'|'error'} type which of the two it is
 * @param {number} [durationMs] how long it stays, where zero stays until it is
 *   dismissed. The default is none for an error and six seconds for the rest.
 */
export function showToast(message, type = 'success', durationMs = undefined) {
  const duration = durationMs ?? (type === 'error' ? 0 : 6000);
  toast.set({ message, type, duration });
}
