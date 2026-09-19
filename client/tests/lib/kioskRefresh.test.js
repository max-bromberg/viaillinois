import { describe, it, expect, vi, beforeEach } from 'vitest';
import { watchForNewVersion } from '../../src/lib/kioskRefresh.js';

/**
 * A lobby screen runs for months without anybody touching it.
 *
 * Two things go stale on it. The events it shows, which it already refetches on
 * an interval, and the code it is running, which it does not. That second one
 * is worse than it sounds: each build names its files by their content, so a
 * screen that has been open across a deploy is holding a page whose next lazily
 * fetched piece no longer exists on the server. The site already has a message
 * for that, and a message is no use on a wall nobody reads.
 *
 * A service worker is the usual answer and is the wrong one here. Its whole
 * purpose is to keep serving what it cached, and a kiosk stuck on a cached
 * build is exactly the failure being fixed, with the cache now making it
 * durable. The platform already reports the version it is running, so the
 * screen reads that and reloads itself when the two disagree.
 *
 * It never reloads mid slide. A reload is taken at a slide boundary, where a
 * screen is changing anyway and nobody sees anything but the next event.
 */
beforeEach(() => vi.useRealTimers());

const versionReader = versions => {
  let at = 0;
  return vi.fn(async () => versions[Math.min(at++, versions.length - 1)]);
};

describe('watching for a new deployment', () => {
  it('says nothing while the platform is running what the screen is running', async () => {
    const onStale = vi.fn();
    const watch = watchForNewVersion({
      current: '0.6.1', read: versionReader(['0.6.1', '0.6.1']), onStale, intervalMs: 5,
    });
    await new Promise(done => setTimeout(done, 40));
    watch.stop();
    expect(onStale).not.toHaveBeenCalled();
  });

  it('says so once the platform is running something else', async () => {
    const onStale = vi.fn();
    const watch = watchForNewVersion({
      current: '0.6.1', read: versionReader(['0.6.1', '0.6.2']), onStale, intervalMs: 5,
    });
    await new Promise(done => setTimeout(done, 60));
    watch.stop();
    expect(onStale).toHaveBeenCalled();
  });

  it('says so only once, however long the screen stays on the old build', async () => {
    const onStale = vi.fn();
    const watch = watchForNewVersion({
      current: '0.6.1', read: versionReader(['0.6.2']), onStale, intervalMs: 5,
    });
    await new Promise(done => setTimeout(done, 60));
    watch.stop();
    expect(onStale).toHaveBeenCalledTimes(1);
  });

  /**
   * A screen that cannot reach the platform is a screen on a network that is
   * having a bad day, and reloading it then would replace a working display of
   * slightly old events with a browser error page.
   */
  it('does nothing at all when the platform cannot be reached', async () => {
    const onStale = vi.fn();
    const watch = watchForNewVersion({
      current: '0.6.1',
      read: vi.fn().mockRejectedValue(new Error('the network is gone')),
      onStale,
      intervalMs: 5,
    });
    await new Promise(done => setTimeout(done, 40));
    watch.stop();
    expect(onStale).not.toHaveBeenCalled();
  });

  it('does nothing when the platform will not say what it is running', async () => {
    const onStale = vi.fn();
    const watch = watchForNewVersion({
      current: '0.6.1', read: vi.fn().mockResolvedValue(null), onStale, intervalMs: 5,
    });
    await new Promise(done => setTimeout(done, 40));
    watch.stop();
    expect(onStale).not.toHaveBeenCalled();
  });

  it('stops asking once it is stopped', async () => {
    const read = versionReader(['0.6.1']);
    const watch = watchForNewVersion({ current: '0.6.1', read, onStale: vi.fn(), intervalMs: 5 });
    await new Promise(done => setTimeout(done, 30));
    watch.stop();
    const asked = read.mock.calls.length;
    await new Promise(done => setTimeout(done, 40));
    expect(read.mock.calls.length).toBe(asked);
  });
});
