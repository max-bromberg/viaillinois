/**
 * Read a pasted roster into NetIDs.
 *
 * An RSO board building its membership list pastes what it already has: a
 * column out of a spreadsheet, a list of NetIDs, a list of Illinois addresses,
 * or a mixture of all three with stray commas and blank lines through it.
 *
 * Anything that cannot be a NetID is reported back rather than quietly
 * dropped, so the board can see what was not understood and fix it.
 */

/** Letters, digits and hyphens, which is what a NetID is made of. */
const NET_ID = /^[a-z0-9-]{2,20}$/;

/** A word people put at the top of a pasted column, not a person. */
const HEADERS = new Set(['netid', 'net id', 'email', 'name', 'member', 'members', 'role']);

export function parseRoster(text) {
  const netIds = [];
  const rejected = [];
  const seen = new Set();

  // Fields are separated by line breaks, commas, semicolons and tabs, and not
  // by spaces. A pasted spreadsheet column carries names beside addresses, and
  // splitting on spaces turned "Jane Doe jdoe2@illinois.edu" into three
  // accounts, two of them words from a person's name.
  for (const rawToken of String(text ?? '').split(/[\r\n,;\t]+/)) {
    const token = rawToken.trim();
    if (!token) continue;
    if (HEADERS.has(token.toLowerCase())) continue;

    let candidate = token.toLowerCase();
    if (/\s/.test(candidate)) {
      // Several words with no separator between them. There is no way to tell
      // which one was meant to be the NetID, so it is reported rather than
      // guessed at.
      rejected.push(token);
      continue;
    }
    if (candidate.includes('@')) {
      const [local, domain] = candidate.split('@');
      // Only an Illinois address carries a NetID in its local part. Accepting
      // any other domain would create an account nobody can ever sign in to.
      if (domain !== 'illinois.edu') {
        rejected.push(token);
        continue;
      }
      candidate = local;
    }

    if (!NET_ID.test(candidate)) {
      rejected.push(token);
      continue;
    }
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    netIds.push(candidate);
  }

  return { netIds, rejected };
}
