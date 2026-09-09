import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';

const getTags = vi.hoisted(() => vi.fn());
const createTag = vi.hoisted(() => vi.fn());
const deleteTag = vi.hoisted(() => vi.fn());
const showToast = vi.hoisted(() => vi.fn());

vi.mock('../../src/api/tags.js', () => ({ getTags, createTag, deleteTag }));
vi.mock('../../src/stores/ui.js', () => ({ showToast }));

const TagManager = (await import('../../src/lib/TagManager.svelte')).default;

beforeEach(() => {
  vi.clearAllMocks();
  getTags.mockResolvedValue({
    tags: [{ tag_name: 'Free Food', events: 12 }, { tag_name: 'Workshop', events: 0 }],
  });
  createTag.mockResolvedValue({ tag_name: 'Hackathon' });
  deleteTag.mockResolvedValue({ ok: true });
});

/**
 * The tags a board may put on an event were written into the code, so adding
 * one meant a release. An admin keeps the list here instead.
 */
describe('TagManager', () => {
  it('lists the tags and how many events carry each one', async () => {
    const { findByText, getByText } = render(TagManager);
    expect(await findByText('Free Food')).toBeTruthy();
    expect(getByText('12 events')).toBeTruthy();
    expect(getByText('no events')).toBeTruthy();
  });

  it('adds a tag and reads the list again', async () => {
    const { getByPlaceholderText, getByRole } = render(TagManager);
    await waitFor(() => expect(getTags).toHaveBeenCalled());
    await fireEvent.input(getByPlaceholderText(/new tag/i), { target: { value: 'Hackathon' } });
    await fireEvent.click(getByRole('button', { name: 'Add tag' }));
    await waitFor(() => expect(createTag).toHaveBeenCalledWith('Hackathon'));
    await waitFor(() => expect(getTags.mock.calls.length).toBeGreaterThan(1));
  });

  it('will not add an empty tag', async () => {
    const { getByRole } = render(TagManager);
    await waitFor(() => expect(getTags).toHaveBeenCalled());
    await fireEvent.click(getByRole('button', { name: 'Add tag' }));
    expect(createTag).not.toHaveBeenCalled();
  });

  /**
   * Event_Tags cascades, so removing a tag takes it off every event carrying
   * it. An admin should be told how many that is before it happens.
   */
  it('says what removing a tag will do to the events that carry it', async () => {
    const { findByRole, getByText } = render(TagManager);
    await fireEvent.click(await findByRole('button', { name: /Remove Free Food/i }));
    expect(getByText(/12 events will lose this tag/i)).toBeTruthy();
    expect(deleteTag).not.toHaveBeenCalled();
  });

  it('removes it once that is confirmed', async () => {
    const { findByRole, getByRole } = render(TagManager);
    await fireEvent.click(await findByRole('button', { name: /Remove Free Food/i }));
    await fireEvent.click(getByRole('button', { name: /Yes, remove it/i }));
    await waitFor(() => expect(deleteTag).toHaveBeenCalledWith('Free Food'));
  });

  it('reports what went wrong rather than failing quietly', async () => {
    createTag.mockRejectedValue(new Error('That tag is already on the list.'));
    const { getByPlaceholderText, getByRole } = render(TagManager);
    await waitFor(() => expect(getTags).toHaveBeenCalled());
    await fireEvent.input(getByPlaceholderText(/new tag/i), { target: { value: 'Workshop' } });
    await fireEvent.click(getByRole('button', { name: 'Add tag' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('That tag is already on the list.', 'error'));
  });
});
