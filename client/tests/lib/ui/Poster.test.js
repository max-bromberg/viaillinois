import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { Poster } from '../../../src/lib/components/ui/Poster/index.js';
import { organizationColor } from '../../../src/lib/organizationColor.js';

/**
 * The event page is a poster. The organization's light falls across the whole
 * top of it, the title is set at poster size, and the actions sit down the right
 * with no box around them. The board's tools appear only for a signed in board
 * member of that organization.
 */
const EVENT = {
  event_id: 3,
  title: 'Texas Instruments Info Session',
  description: 'Recruiters from TI on internships and new grad roles.',
  start_time: '2026-09-11T12:30:00-05:00',
  end_time: '2026-09-11T14:00:00-05:00',
  rso_name: 'WECE',
  rso_full_name: 'Women in Electrical and Computer Engineering',
  rso_color: '#7C3AED',
  building: 'ECEB',
  building_name: 'Electrical and Computer Engineering Building',
  room_number: '1013',
  tags: 'Corporate,Networking,Free Food',
};

describe('Poster', () => {
  const posterOf = container => container.querySelector('.poster');

  it('sets the title at poster size, as the page heading', () => {
    const { container } = render(Poster, { event: EVENT });
    const title = container.querySelector('.poster h1');
    expect(title.textContent).toBe('Texas Instruments Info Session');
  });

  it('lights the whole top of the page in the organization adapted lamp colour', () => {
    const { container } = render(Poster, { event: EVENT, theme: 'light' });
    const style = posterOf(container).getAttribute('style');
    expect(style).toContain(`--h: ${organizationColor('#7C3AED', 'lamp', 'light')}`);
    expect(style).not.toContain('#7C3AED');
  });

  it('names the organization in its adapted text colour, with its full name beside it', () => {
    const { container } = render(Poster, { event: EVENT, theme: 'light' });
    const org = container.querySelector('.poster .org');
    expect(org.querySelector('b').textContent).toBe('WECE');
    expect(org.textContent).toContain('Women in Electrical and Computer Engineering');
    expect(org.getAttribute('style')).toContain(`--org-text: ${organizationColor('#7C3AED', 'text', 'light')}`);
  });

  it('gives the way back to the feed', () => {
    const { container } = render(Poster, { event: EVENT });
    const back = container.querySelector('.poster .back');
    expect(back.textContent).toContain('All events');
    expect(back.querySelector('svg.i')).toBeTruthy();
  });

  it('says the day, then the time, then the room and the building it is in', () => {
    const { container } = render(Poster, { event: EVENT });
    const when = container.querySelector('.poster .when');
    expect(when.textContent).toContain('Friday, September 11');
    expect(when.textContent).toContain('12:30');
    expect(when.textContent).toContain('to 2:00 PM');
    expect(when.textContent).toContain('ECEB 1013');
    expect(when.textContent).toContain('Electrical and Computer Engineering Building');
  });

  it('carries machine readable times', () => {
    const { container } = render(Poster, { event: EVENT });
    expect(container.querySelector('time').getAttribute('datetime')).toContain('2026-09-11');
  });

  it('draws the tags as words with a stroke', () => {
    const { container } = render(Poster, { event: EVENT });
    const tags = [...container.querySelectorAll('.poster .tags .hl')].map(tag => tag.textContent);
    expect(tags).toEqual(['Corporate', 'Networking', 'Free Food']);
  });

  it('offers one primary action and no more', () => {
    const { container } = render(Poster, { event: EVENT });
    expect(container.querySelectorAll('.poster .btn.primary').length).toBe(1);
  });

  it('puts no box around the actions', () => {
    const { container } = render(Poster, { event: EVENT });
    const aside = container.querySelector('.poster aside');
    expect(aside.getAttribute('style') ?? '').not.toMatch(/border|background/);
  });

  it('shows the link to copy, in mono, beside the code that carries it', () => {
    const { container } = render(Poster, { event: EVENT, url: 'viaillinois.com/events/3' });
    expect(container.querySelector('.poster .link').textContent).toBe('viaillinois.com/events/3');
    expect(container.querySelector('.poster .share')).toBeTruthy();
  });

  it('keeps the board tools away from everybody who is not on that board', () => {
    const { container } = render(Poster, { event: EVENT });
    expect(container.querySelector('.poster .board')).toBe(null);
  });

  it('shows the board its own tools, in a well cut at 14 px', () => {
    const { container } = render(Poster, { event: EVENT, onBoard: true });
    const board = container.querySelector('.poster .board');
    expect(board).toBeTruthy();
    expect(board.textContent).toContain('You are on the WECE board');
    expect(board.getAttribute('style')).toContain('--cut: 14px');
    expect(board.querySelector('.btn.danger')).toBeTruthy();
  });

  it('says a cancelled event is cancelled, in words', () => {
    const { container } = render(Poster, { event: { ...EVENT, cancelled_at: '2026-09-10T12:00:00-05:00' } });
    expect(container.textContent).toContain('Cancelled');
  });
});
