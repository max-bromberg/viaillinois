import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { EventRow } from '../../../src/lib/components/ui/EventRow/index.js';
import { organizationColor } from '../../../src/lib/organizationColor.js';

/**
 * The row is the agenda. The time is the largest thing on it, the organization
 * lights it from its top left corner, and the tags are words with a stroke under
 * them. Cover the titles with your hand and you can still tell what is happening
 * tonight, and when, which is the test the philosophy document sets.
 */
const EVENT = {
  event_id: 1,
  title: 'Intro to PCB Design Workshop',
  description: 'Bring a laptop and learn KiCad from scratch.',
  start_time: '2026-09-10T18:00:00-05:00',
  end_time: '2026-09-10T20:00:00-05:00',
  rso_name: 'IEEE',
  rso_color: '#00629B',
  building: 'ECEB',
  room_number: '1002',
  tags: 'Workshop,Free Food',
};

describe('EventRow', () => {
  const rowOf = container => container.querySelector('.ev');

  it('sets the start time largest, with the meridiem small beside it', () => {
    const { container } = render(EventRow, { event: EVENT });
    const time = container.querySelector('.ev .t');
    expect(time.textContent.replace(/\s+/g, '')).toContain('6:00PM');
    expect(time.querySelector('small').textContent).toBe('PM');
  });

  it('puts the end time in mono under the start, as one phrase', () => {
    const { container } = render(EventRow, { event: EVENT });
    expect(container.querySelector('.ev .t em').textContent).toBe('to 8:00 PM');
  });

  it('carries machine readable times as well as legible ones', () => {
    const { container } = render(EventRow, { event: EVENT });
    expect(container.querySelector('time').getAttribute('datetime')).toContain('2026-09-10');
  });

  it('is cut at the top right, at 14 px', () => {
    const { container } = render(EventRow, { event: EVENT });
    const row = rowOf(container);
    expect(row.classList.contains('cut')).toBe(true);
    expect(row.getAttribute('style')).toContain('--cut: 14px');
  });

  /**
   * An organization's colour is never shown as it was given. The lamp, the pad
   * and the name each take their own adapted colour, so that neon calms down and
   * a navy still reads.
   */
  it('lights the row with the adapted lamp colour, never with the stored one', () => {
    const { container } = render(EventRow, { event: EVENT, theme: 'light' });
    const style = rowOf(container).getAttribute('style');
    expect(style).toContain(`--h: ${organizationColor('#00629B', 'lamp', 'light')}`);
    expect(style).not.toContain('#00629B');
  });

  it('marks and names the organization in their own adapted colours', () => {
    const { container } = render(EventRow, { event: EVENT, theme: 'light' });
    const org = container.querySelector('.ev .b .meta .org');
    expect(org.textContent).toContain('IEEE');
    expect(org.getAttribute('style')).toContain(`--org-text: ${organizationColor('#00629B', 'text', 'light')}`);
    expect(org.querySelector('.pad').getAttribute('style')).toContain(organizationColor('#00629B', 'mark', 'light'));
  });

  it('adapts differently for the dark theme, because a dark page needs a lighter colour', () => {
    const { container: light } = render(EventRow, { event: EVENT, theme: 'light' });
    const { container: dark } = render(EventRow, { event: EVENT, theme: 'dark' });
    expect(rowOf(dark).getAttribute('style')).not.toBe(rowOf(light).getAttribute('style'));
  });

  it('names the room with a pin drawn rather than typed', () => {
    const { container } = render(EventRow, { event: EVENT });
    const room = container.querySelector('.ev .b .meta .room');
    expect(room.textContent).toContain('ECEB 1002');
    expect(room.querySelector('svg.i')).toBeTruthy();
  });

  it('draws the tags as words with a stroke, never as filled pills', () => {
    const { container } = render(EventRow, { event: EVENT });
    const tags = container.querySelectorAll('.ev .b .tags .hl');
    expect([...tags].map(tag => tag.textContent)).toEqual(['Workshop', 'Free Food']);
  });

  it('gives the same tag the same hue everywhere, by name rather than by position', () => {
    const { container: first } = render(EventRow, { event: EVENT });
    const { container: second } = render(EventRow, { event: { ...EVENT, tags: 'Free Food' } });
    const workshopFirst = [...first.querySelectorAll('.tags .hl')].find(tag => tag.textContent === 'Free Food');
    const workshopSecond = second.querySelector('.tags .hl');
    expect(workshopSecond.getAttribute('style')).toBe(workshopFirst.getAttribute('style'));
  });

  it('says "Happening now" in words, not only by turning the lamp orange', () => {
    const { container } = render(EventRow, { event: EVENT, live: true });
    const row = rowOf(container);
    expect(row.classList.contains('now')).toBe(true);
    const tag = container.querySelector('.nowtag');
    expect(tag.textContent).toContain('Happening now');
    expect(tag.querySelector('.pad').classList.contains('breathing')).toBe(true);
  });

  /**
   * A cancelled row is a well, and the eight tag hues do not clear the contrast
   * threshold that far down, so a cancelled row carries its status and no tags.
   */
  it('strikes a cancelled title through, says it is cancelled, and drops the tags', () => {
    const { container } = render(EventRow, { event: { ...EVENT, cancelled_at: '2026-09-09T12:00:00-05:00' } });
    const row = rowOf(container);
    expect(row.classList.contains('cancel')).toBe(true);
    expect(container.querySelector('.ev .s .hl').textContent).toBe('Cancelled');
    expect(container.querySelector('.ev .b .tags')).toBe(null);
    expect(container.querySelector('.ev .b .desc')).toBe(null);
  });

  it('leads to the event, from a title that is a link', () => {
    const { container } = render(EventRow, { event: EVENT });
    const link = container.querySelector('.ev .b .title a');
    expect(link.getAttribute('href')).toBe('/events/1');
  });

  it('brightens under a cursor, which is the only thing raised elevation does', () => {
    const { container } = render(EventRow, { event: EVENT });
    expect(rowOf(container).classList.contains('reactive')).toBe(true);
    // Nothing lifts and nothing gains a shadow: the row stays where it is.
    expect(rowOf(container).getAttribute('style')).not.toMatch(/box-shadow|translate/);
  });

  it('carries no raw colour of its own', () => {
    const { container } = render(EventRow, { event: { ...EVENT, rso_color: null } });
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3}\b/);
  });
});

/**
 * A location takes one of three forms: a room the platform knows about, free
 * text the organizer typed for somewhere that is not a room, or nothing at all
 * because it has not been decided. The row read only the first of the three, so
 * an online event and one in the Illini Union showed no location at all, and an
 * undecided one said nothing rather than saying it was undecided. The old card
 * had three tests for exactly these cases and they went with it.
 */
describe('EventRow, where the event is', () => {
  const roomOf = container => container.querySelector('.ev .b .meta .room');

  it('shows the room when the event is in one', () => {
    const { container } = render(EventRow, { event: EVENT });
    expect(roomOf(container).textContent).toContain('ECEB 1002');
  });

  it('shows the free text when there is no room', () => {
    const { container } = render(EventRow, {
      event: { ...EVENT, building: null, room_number: null, location_text: 'Illini Union, room 314' },
    });
    expect(roomOf(container).textContent).toContain('Illini Union, room 314');
  });

  it('says the location is undecided when there is neither', () => {
    const { container } = render(EventRow, {
      event: { ...EVENT, building: null, room_number: null, location_text: null },
    });
    expect(roomOf(container).textContent).toContain('Location to be announced');
  });

  it('prefers the room over the free text when both are there', () => {
    const { container } = render(EventRow, { event: { ...EVENT, location_text: 'Somewhere else' } });
    expect(roomOf(container).textContent).toContain('ECEB 1002');
    expect(roomOf(container).textContent).not.toContain('Somewhere else');
  });

  it('says nothing about the location when the reader may not see it', () => {
    const { container } = render(EventRow, { event: EVENT, showRoom: false });
    expect(roomOf(container)).toBe(null);
  });
});

/**
 * Cancelled, happening now and internal are three different facts and an event
 * can be more than one of them at once. Read as one chain, a cancelled internal
 * event said only that it was cancelled, and a board member scanning the feed
 * could not tell it had never been public.
 */
describe('EventRow, more than one thing at once', () => {
  const said = container => [...container.querySelectorAll('.ev .s')].map(n => n.textContent).join(' ');

  it('says an internal event is internal', () => {
    const { container } = render(EventRow, { event: { ...EVENT, is_private: 1 } });
    expect(said(container)).toContain('Internal');
  });

  it('still says so when the event is cancelled', () => {
    const { container } = render(EventRow, {
      event: { ...EVENT, is_private: 1, cancelled_at: '2026-09-09T12:00:00-05:00' },
    });
    expect(said(container)).toContain('Cancelled');
    expect(said(container)).toContain('Internal');
  });

  it('still says so when the event is happening now', () => {
    const { container } = render(EventRow, { event: { ...EVENT, is_private: 1 }, live: true });
    expect(said(container)).toContain('Happening now');
    expect(said(container)).toContain('Internal');
  });
});
