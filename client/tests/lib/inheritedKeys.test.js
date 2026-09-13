import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { Icon } from '../../src/lib/components/ui/index.js';
import { organizationColor } from '../../src/lib/organizationColor.js';

/**
 * A name looked up in a plain object finds what every object inherits.
 *
 * Three lookups on the site read a table by a name and treat anything truthy as
 * a hit. Every plain object inherits constructor, toString, valueOf and the
 * rest from Object.prototype, so those names are hits that were never put in
 * the table, and what comes back is a function rather than the icon, the
 * sentence or the colour role that was asked for.
 *
 * On the account page the name comes off the address bar, so anybody could hand
 * a reader a link that put the source of a function into a toast on their own
 * account page. The other two are reachable only from the client's own code,
 * and they are closed the same way, because a lookup that answers a question
 * nobody asked is a defect wherever it sits.
 */
const INHERITED = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf'];

describe('a name that is not in the table', () => {
  it('is not one of the eight icons', () => {
    for (const name of INHERITED) {
      expect(() => render(Icon, { name }), `${name} was taken for an icon`).toThrow(/there is no/);
    }
  });

  it('is not a role an organization colour is drawn in', () => {
    for (const role of INHERITED) {
      expect(() => organizationColor('#00629B', role, 'light'), `${role} was taken for a role`).toThrow(/there is no/);
    }
  });
});
