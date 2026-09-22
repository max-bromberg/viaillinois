import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';

const getMyNotifications = vi.hoisted(() => vi.fn());
const followOrganization = vi.hoisted(() => vi.fn());
const remindAboutEvent = vi.hoisted(() => vi.fn());
const showToast = vi.hoisted(() => vi.fn());

vi.mock('../../src/api/notifications.js', () => ({
  getMyNotifications, followOrganization, remindAboutEvent,
}));
vi.mock('../../src/stores/ui.js', async importOriginal => ({
  ...await importOriginal(), showToast,
}));

const NotifyToggle = (await import('../../src/lib/NotifyToggle.svelte')).default;

beforeEach(() => {
  vi.clearAllMocks();
  getMyNotifications.mockResolvedValue({ linked: true, following: [], reminders: [] });
  followOrganization.mockResolvedValue(undefined);
  remindAboutEvent.mockResolvedValue(undefined);
});

/**
 * Choosing to hear about an organization, or about one event, from the page
 * that is about it.
 *
 * Both of these were reachable only by typing a command in Discord, which is
 * the wrong moment: somebody decides they care about an organization while
 * they are reading about it. The control says what it will do in terms of
 * being told rather than in terms of the bot, and it says what it already is,
 * because a switch whose state you cannot read is worse than no switch.
 */
describe('choosing to be told about something', () => {
  const org = () => render(NotifyToggle, { props: { kind: 'organization', id: 4, name: 'IEEE' } });
  const event = () => render(NotifyToggle, { props: { kind: 'event', id: 12, name: 'PCB night' } });

  it('offers to follow an organization somebody does not follow', async () => {
    const { findByRole } = org();
    const button = await findByRole('button', { name: /follow/i });
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows an organization somebody already follows as followed', async () => {
    getMyNotifications.mockResolvedValue({ linked: true, following: [4], reminders: [] });
    const { findByRole } = org();
    const button = await findByRole('button', { name: /following|follow/i });
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('follows when pressed, and shows the new answer at once', async () => {
    const { findByRole } = org();
    await fireEvent.click(await findByRole('button', { name: /follow/i }));

    await waitFor(() => expect(followOrganization).toHaveBeenCalledWith(4, true));
    await waitFor(() => expect(
      document.querySelector('[aria-pressed="true"]')).toBeTruthy());
  });

  it('stops following when pressed again', async () => {
    getMyNotifications.mockResolvedValue({ linked: true, following: [4], reminders: [] });
    const { findByRole } = org();
    await fireEvent.click(await findByRole('button', { name: /following|follow/i }));
    await waitFor(() => expect(followOrganization).toHaveBeenCalledWith(4, false));
  });

  it('asks for a reminder about one event', async () => {
    const { findByRole } = event();
    await fireEvent.click(await findByRole('button', { name: /remind/i }));
    await waitFor(() => expect(remindAboutEvent).toHaveBeenCalledWith(12, true));
  });

  /**
   * A choice that did not take must not be left looking as though it did. The
   * control goes back to what it was and says what went wrong.
   */
  it('puts the control back when the website refused the change', async () => {
    followOrganization.mockRejectedValue(new Error('Link your Discord account to VIA first.'));
    const { findByRole } = org();
    await fireEvent.click(await findByRole('button', { name: /follow/i }));

    await waitFor(() => expect(showToast)
      .toHaveBeenCalledWith(expect.stringContaining('Link your Discord'), 'error'));
    await waitFor(() => expect(
      document.querySelector('[aria-pressed="false"]')).toBeTruthy());
  });

  /**
   * Somebody who has not linked a Discord account cannot be sent anything, so
   * the control is a way to the page that explains how rather than a switch
   * that would refuse.
   */
  it('points somebody who has not linked at the page that explains it', async () => {
    getMyNotifications.mockResolvedValue({ linked: false, following: [], reminders: [] });
    const { findByRole } = org();
    const link = await findByRole('link', { name: /follow|notified|remind/i });
    expect(link.getAttribute('href')).toBe('/notifications');
  });

  /** Somebody not signed in is offered the same way in rather than a refusal. */
  it('points somebody who is not signed in at the same page', async () => {
    getMyNotifications.mockRejectedValue(new Error('Authentication required'));
    const { findByRole } = org();
    const link = await findByRole('link', { name: /follow|notified|remind/i });
    expect(link.getAttribute('href')).toBe('/notifications');
  });
});
