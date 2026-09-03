import { describe, it, expect } from 'vitest';
import { clientIp } from '../../lib/clientIdentity.js';

/**
 * Requests reach VIA through Cloudflare and then through Nginx Proxy Manager,
 * which appends its own view of the peer to X-Forwarded-For. The last entry of
 * that header is therefore a Cloudflare edge address, not a visitor, and
 * anything keyed on it buckets a whole region of the internet together.
 * CF-Connecting-IP is written by Cloudflare itself and passed through
 * unchanged, so it is the one entry that means what it says.
 */
function reqWith(headers, remoteAddress = '10.0.0.7') {
  return { headers, socket: { remoteAddress } };
}

describe('clientIp', () => {
  it('prefers the address Cloudflare states', () => {
    const req = reqWith({
      'cf-connecting-ip': '203.0.113.9',
      'x-forwarded-for': '203.0.113.9, 172.71.0.4',
    });
    expect(clientIp(req)).toBe('203.0.113.9');
  });

  it('ignores a forwarded chain that disagrees with Cloudflare', () => {
    const req = reqWith({
      'cf-connecting-ip': '203.0.113.9',
      'x-forwarded-for': '1.2.3.4, 203.0.113.9, 172.71.0.4',
    });
    expect(clientIp(req)).toBe('203.0.113.9');
  });

  it('falls back to the first forwarded entry when Cloudflare is absent', () => {
    const req = reqWith({ 'x-forwarded-for': '198.51.100.2, 172.71.0.4' });
    expect(clientIp(req)).toBe('198.51.100.2');
  });

  it('falls back to the socket in development, where no proxy exists', () => {
    expect(clientIp(reqWith({}, '127.0.0.1'))).toBe('127.0.0.1');
  });

  it('rejects a header that is not an address and keeps looking', () => {
    const req = reqWith({ 'cf-connecting-ip': 'not-an-address' }, '127.0.0.1');
    expect(clientIp(req)).toBe('127.0.0.1');
  });

  it('answers with a stable placeholder rather than undefined', () => {
    expect(clientIp({ headers: {}, socket: {} })).toBe('unknown');
  });
});
