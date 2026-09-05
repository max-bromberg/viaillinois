import { writable } from 'svelte/store';

const ROUTES = [
  { name: 'event-detail',  pattern: /^\/events\/(\d+)$/,    paramNames: ['id'] },
  { name: 'update-detail', pattern: /^\/updates\/([^/]+)$/, paramNames: ['slug'] },
  // A link session identifier is thirty two random bytes written URL safe,
  // which is forty three characters, and the shape is checked here so that a
  // stray address never becomes a request.
  { name: 'link-discord',      pattern: /^\/link\/discord\/([A-Za-z0-9_-]{43})$/,      paramNames: ['session'] },
  // The page shown once the link is made says the same thing to everybody and
  // asks the server nothing, so nothing is captured out of its address.
  { name: 'link-discord-done', pattern: /^\/link\/discord\/[A-Za-z0-9_-]{43}\/done$/, paramNames: [] },
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
  const pathname = to.split('?')[0];
  currentPath.set(pathname);
  routeParams.set(matchRoute(pathname)?.params ?? {});
}

window.addEventListener('popstate', () => {
  const path = window.location.pathname;
  currentPath.set(path);
  routeParams.set(matchRoute(path)?.params ?? {});
});
