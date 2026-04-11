import { writable, derived } from 'svelte/store';

// { net_id, full_name, email, is_global_admin, memberships: [{rso_id, name, role}] } | null
export const currentUser = writable(null);

// true if the user has any RSO Admin or Board role
export const isRsoAdmin = derived(currentUser, ($user) =>
  $user?.memberships?.some(m => ['Admin', 'Board'].includes(m.role)) ?? false
);

// true if global admin
export const isGlobalAdmin = derived(currentUser, ($user) => $user?.is_global_admin ?? false);

// RSO IDs where this user has admin/board access
export const adminRsoIds = derived(currentUser, ($user) =>
  ($user?.memberships ?? [])
    .filter(m => ['Admin', 'Board'].includes(m.role))
    .map(m => m.rso_id)
);
