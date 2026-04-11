import { writable } from 'svelte/store';

export const isLoading  = writable(false);
export const modalOpen  = writable(false);
export const modalContent = writable(null); // { component, props }
export const toast      = writable(null);   // { message, type: 'success'|'error' }

export function showToast(message, type = 'success', durationMs = 3000) {
  toast.set({ message, type });
  setTimeout(() => toast.set(null), durationMs);
}
