import { writable } from 'svelte/store';

export const currentPath = writable(window.location.pathname);

export function navigate(to) {
  history.pushState({}, '', to);
  currentPath.set(to);
}

window.addEventListener('popstate', () => {
  currentPath.set(window.location.pathname);
});
