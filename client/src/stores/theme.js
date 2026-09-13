import { writable, derived, readable } from 'svelte/store';

const STORAGE_KEY = 'via-theme';

function getInitial() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'auto' || saved === 'light' || saved === 'dark') return saved;
  } catch {}
  return 'auto';
}

/** What the reader asked for: 'auto', 'light' or 'dark'. */
export const themeMode = writable(getInitial());

themeMode.subscribe(mode => {
  try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
});

/**
 * Whether the system asks for a dark page, kept up to date while anybody is
 * watching. Guarded, because a browser that cannot answer the question is not a
 * reason to leave the page unable to draw itself.
 */
const prefersDark = readable(false, set => {
  let query;
  try {
    query = window.matchMedia('(prefers-color-scheme: dark)');
  } catch {
    set(false);
    return () => {};
  }
  set(query.matches);
  const onChange = event => set(event.matches);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
});

/**
 * Which theme the page is actually in, 'light' or 'dark'.
 *
 * The theme control offers three answers and only two of them name a theme. An
 * organization's colour is adapted differently for a light page and a dark one,
 * and that adaptation happens in the client rather than in the stylesheet, so
 * the third answer is resolved once here. Left to each component to work out,
 * "auto" would be read one way in the filter rail and another in the agenda, and
 * one organization would be two colours on one screen.
 */
export const resolvedTheme = derived(
  [themeMode, prefersDark],
  ([mode, systemPrefersDark]) => {
    if (mode === 'dark') return 'dark';
    if (mode === 'light') return 'light';
    return systemPrefersDark ? 'dark' : 'light';
  },
);
