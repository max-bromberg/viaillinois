/**
 * Keeping a lobby screen current without anybody going to it.
 *
 * Two things go stale on a screen that has been running for months. The events
 * it shows, which the kiosk already refetches on its own interval, and the code
 * it is running, which nothing was watching.
 *
 * The second is worse than it sounds. Each build names its files by their
 * content, so a screen left open across a deploy is holding a page whose next
 * lazily fetched piece is no longer on the server. The site has a message for
 * that, and a message is no use on a wall nobody reads.
 *
 * A service worker is the usual answer to "keep this page fresh" and is the
 * wrong one here. Its purpose is to go on serving what it cached, so a kiosk
 * stuck on an old build would be exactly the failure being fixed, with the
 * cache making it durable and a good deal harder to clear from across campus.
 * The platform already reports the version it is running, on an endpoint that
 * is never refused under load, so the screen reads that and reloads itself when
 * the two disagree. There is nothing to invalidate and nothing to clear.
 */

/** How often a screen asks what the platform is running. */
export const VERSION_POLL_MS = 10 * 60 * 1000;

/** What the platform says it is running, or nothing. */
export async function readPlatformVersion() {
  const res = await fetch('/health', { cache: 'no-store' });
  if (!res.ok) throw new Error(`health answered ${res.status}`);
  const body = await res.json();
  return body?.version ?? null;
}

/**
 * Watch for the platform running something other than this build.
 *
 * A screen that cannot reach the platform is a screen on a network having a bad
 * day, and reloading then would replace a working display of slightly old
 * events with a browser error page. So an unreachable platform, and a platform
 * that will not say what it is running, are both treated as nothing to do.
 *
 * @param {{ current: string, read: () => Promise<string|null>, onStale: () => void, intervalMs?: number }} options
 */
export function watchForNewVersion({ current, read, onStale, intervalMs = VERSION_POLL_MS }) {
  let said = false;

  const look = async () => {
    if (said) return;
    try {
      const running = await read();
      if (!running || running === current) return;
      said = true;
      onStale();
    } catch {
      // Nothing to do. The screen goes on showing what it has.
    }
  };

  const timer = setInterval(look, intervalMs);
  timer.unref?.();

  return {
    /** For the kiosk's own teardown. */
    stop() { clearInterval(timer); },
    /** For a caller that wants to ask now rather than wait out the interval. */
    check: look,
  };
}
