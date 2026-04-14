import { writable } from 'svelte/store';

const ROUTES = [
  { name: 'event-detail', pattern: /^\/events\/(\d+)$/, paramNames: ['id'] },
];

export function matchRoute(path) {
  for (const route of ROUTES) {
    const match = path.match(route.pattern);
    if (match) {
      const params = {};
      route.paramNames.forEach((name, i) => { params[name] = match[i + 1]; });
      return { name: route.name, params };
    }
  }
  return null;
}

export const currentPath = writable(window.location.pathname);
export const routeParams = writable(matchRoute(window.location.pathname)?.params ?? {});

export function navigate(to) {
  history.pushState({}, '', to);
  currentPath.set(to);
  routeParams.set(matchRoute(to)?.params ?? {});
}

window.addEventListener('popstate', () => {
  const path = window.location.pathname;
  currentPath.set(path);
  routeParams.set(matchRoute(path)?.params ?? {});
});
