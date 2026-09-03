import { describe, it, expect } from 'vitest';
import { trustedProxyHops } from '../../lib/clientIdentity.js';

/**
 * The hop count decides which forwarded address Express calls the visitor's.
 * Read straight through parseInt, a typo in the environment yields NaN, which
 * Express takes as a trust setting of its own and which silently changes who
 * every rate limit thinks it is talking to. A value that is not a count falls
 * back to the real hop count instead, which is Cloudflare then Nginx Proxy
 * Manager.
 */
describe('trustedProxyHops', () => {
  it('is two when nothing is set, which is the real chain', () => {
    expect(trustedProxyHops({})).toBe(2);
  });

  it('takes a number the operator set', () => {
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: '3' })).toBe(3);
  });

  it('falls back rather than yielding NaN on a value that is not a count', () => {
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: 'two' })).toBe(2);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: '' })).toBe(2);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: '-1' })).toBe(2);
  });
});
