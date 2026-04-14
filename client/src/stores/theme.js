import { writable } from 'svelte/store';

const STORAGE_KEY = 'via-theme';

function getInitial() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'auto' || saved === 'light' || saved === 'dark') return saved;
  } catch {}
  return 'auto';
}

export const themeMode = writable(getInitial());

themeMode.subscribe(mode => {
  try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
});
