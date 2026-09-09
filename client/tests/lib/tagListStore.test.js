import { beforeEach, describe, it, expect, vi } from 'vitest';
import { get } from 'svelte/store';

/**
 * A tag list that cannot be read should not leave a board unable to describe an
 * event, so the eight tags the platform shipped with stand in until a real list
 * arrives, and stay if none ever does.
 */
const getTags = vi.hoisted(() => vi.fn());
vi.mock('../../src/api/tags.js', () => ({ getTags, createTag: vi.fn(), deleteTag: vi.fn() }));

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

// The store is one module level thing, and it keeps the last list it read.
// Each of these is about a page opening for the first time, so each gets a
// module registry of its own.
beforeEach(() => vi.resetModules());

describe('the tag list store', () => {
  it('holds the tags the platform shipped with before any list has arrived', async () => {
    getTags.mockReturnValue(new Promise(() => {}));
    const { tagNames, FALLBACK_TAGS } = await import('../../src/lib/tagList.js');
    const stop = tagNames.subscribe(() => {});
    expect(get(tagNames)).toEqual(FALLBACK_TAGS);
    stop();
  });

  it('keeps them when the list cannot be read', async () => {
    getTags.mockRejectedValue(new Error('offline'));
    const { tagNames, FALLBACK_TAGS } = await import('../../src/lib/tagList.js');
    const stop = tagNames.subscribe(() => {});
    await settle();
    expect(get(tagNames)).toEqual(FALLBACK_TAGS);
    stop();
  });

  it('takes the list the platform holds once it arrives', async () => {
    getTags.mockResolvedValue({ tags: [{ tag_name: 'Hackathon' }, { tag_name: 'Career fair' }] });
    const { tagNames } = await import('../../src/lib/tagList.js');
    const stop = tagNames.subscribe(() => {});
    await settle();
    expect(get(tagNames)).toEqual(['Hackathon', 'Career fair']);
    stop();
  });

  /** An empty list is a platform with no tags yet, not an answer to prefer. */
  it('keeps the fallback rather than offering nothing at all', async () => {
    getTags.mockResolvedValue({ tags: [] });
    const { tagNames, FALLBACK_TAGS } = await import('../../src/lib/tagList.js');
    const stop = tagNames.subscribe(() => {});
    await settle();
    expect(get(tagNames)).toEqual(FALLBACK_TAGS);
    stop();
  });
});
