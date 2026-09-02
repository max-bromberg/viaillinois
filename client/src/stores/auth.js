import { writable, derived } from 'svelte/store';

// { net_id, full_name, email, is_global_admin, memberships: [{rso_id, name, role}] } | null
export const currentUser = writable(null);

/**
 * Whether the answer to who is looking has come back yet.
 *
 * currentUser is null both before the question is answered and when the answer
 * is nobody, and those two mean different things on screen: the first is not
 * knowing, and drawing the signed out account menu during it makes the bar
 * flicker for everybody who is signed in.
 */
export const authResolved = writable(false);

// true if the user has any RSO Board role (can manage members + details)
export const isRsoAdmin = derived(currentUser, ($user) =>
  $user?.memberships?.some(m => m.role === 'Board') ?? false
);

// true if global admin
export const isGlobalAdmin = derived(currentUser, ($user) => $user?.is_global_admin ?? false);

// RSO IDs where this user can access the dashboard (Board or Editor)
export const adminRsoIds = derived(currentUser, ($user) =>
  ($user?.memberships ?? [])
    .filter(m => ['Board', 'Editor'].includes(m.role))
    .map(m => m.rso_id)
);

// RSO IDs where this user is a Board member (can manage members + details)
export const boardRsoIds = derived(currentUser, ($user) =>
  ($user?.memberships ?? [])
    .filter(m => m.role === 'Board')
    .map(m => m.rso_id)
);
