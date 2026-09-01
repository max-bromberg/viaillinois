import { describe, it, expect } from 'vitest';
import { pollersEnabled } from '../../lib/pollerConfig.js';

/**
 * The pollers reach out to Course Explorer and Ad Astra as soon as the server
 * boots. That is what production wants and the opposite of what a local
 * preview wants, where it means unsolicited traffic to the university every
 * time someone starts the app.
 */
describe('pollersEnabled', () => {
  it('is on when nothing is configured, so production keeps its behaviour', () => {
    expect(pollersEnabled({})).toBe(true);
  });

  it('is off when explicitly disabled', () => {
    expect(pollersEnabled({ POLLERS_ENABLED: 'false' })).toBe(false);
    expect(pollersEnabled({ POLLERS_ENABLED: '0' })).toBe(false);
  });

  it('is on for any other value, because a typo must not silently stop ingestion', () => {
    expect(pollersEnabled({ POLLERS_ENABLED: 'true' })).toBe(true);
    expect(pollersEnabled({ POLLERS_ENABLED: 'yes' })).toBe(true);
    expect(pollersEnabled({ POLLERS_ENABLED: '' })).toBe(true);
  });
});
