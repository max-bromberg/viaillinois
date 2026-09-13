import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { organizationColor } from '../../src/lib/organizationColor.js';

const getKioskEvents = vi.hoisted(() => vi.fn());
const getConfirmedMidterms = vi.hoisted(() => vi.fn());
const getRsos = vi.hoisted(() => vi.fn());

vi.mock('../../src/api/events.js', () => ({ getKioskEvents }));
vi.mock('../../src/api/midterms.js', () => ({ getConfirmedMidterms }));
vi.mock('../../src/api/rsos.js', () => ({ getRsos }));
vi.mock('../../src/lib/CircuitBackground.svelte', async () => ({
  default: (await import('../stubs/Empty.svelte')).default,
}));

const Kiosk = (await import('../../src/routes/Kiosk.svelte')).default;

/** The afternoon the lobby screen is being read on. */
const NOW = new Date('2026-09-10T15:00:00-05:00');

const EVENTS = [
  {
    event_id: 1, title: 'Intro to PCB Design Workshop', rso_name: 'IEEE',
    building: 'ECEB', room_number: '1002',
    start_time: '2026-09-10T18:00:00-05:00', end_time: '2026-09-10T20:00:00-05:00',
  },
  {
    event_id: 2, title: 'Fall General Meeting', rso_name: 'HKN',
    building: 'ECEB', room_number: '3017',
    start_time: '2026-09-10T19:00:00-05:00', end_time: '2026-09-10T20:00:00-05:00',
  },
];

const MIDTERMS = [
  {
    midterm_id: 9, course_code: 'ECE 210', title: 'Midterm 1',
    building: 'ECEB', room_number: '1002',
    start_time: '2026-09-18T19:00:00-05:00',
  },
  // A midterm in another month is not this month's, so the rail leaves it out.
  {
    midterm_id: 10, course_code: 'ECE 385', title: 'Midterm',
    building: 'ECEB', room_number: '1013',
    start_time: '2026-11-04T19:00:00-05:00',
  },
];

/** Let everything the screen asked for on mount come back. */
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  getKioskEvents.mockReset().mockResolvedValue({ events: EVENTS });
  getConfirmedMidterms.mockReset().mockResolvedValue({ midterms: MIDTERMS });
  getRsos.mockReset().mockResolvedValue({
    rsos: [{ rso_id: 1, name: 'IEEE', logo_color: '#00629B' }],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the kiosk', () => {
  it('draws the shape of the screen until the first answer arrives', async () => {
    const { container } = render(Kiosk);
    expect(container.querySelector('.shape')).toBeTruthy();
    await settle();
    expect(container.querySelector('.shape')).toBeNull();
  });

  it('shows the first event, with the rest in the rail', async () => {
    const { container } = render(Kiosk);
    await settle();
    expect(container.querySelector('.main h1').textContent).toBe('Intro to PCB Design Workshop');
    const rail = [...container.querySelectorAll('.side .item b')].map(node => node.textContent);
    expect(rail).toContain('Fall General Meeting');
  });

  it('turns to the next event after eight seconds and no sooner', async () => {
    const { container } = render(Kiosk);
    await settle();

    await vi.advanceTimersByTimeAsync(7999);
    expect(container.querySelector('.main h1').textContent).toBe('Intro to PCB Design Workshop');

    await vi.advanceTimersByTimeAsync(1);
    expect(container.querySelector('.main h1').textContent).toBe('Fall General Meeting');

    // The rotation wraps, so a screen left alone runs for weeks.
    await vi.advanceTimersByTimeAsync(8000);
    expect(container.querySelector('.main h1').textContent).toBe('Intro to PCB Design Workshop');
  });

  it('asks the feed again every minute', async () => {
    render(Kiosk);
    await settle();
    expect(getKioskEvents).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(59999);
    expect(getKioskEvents).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(getKioskEvents).toHaveBeenCalledTimes(2);
  });

  it('keeps showing what it has when an answer does not come back', async () => {
    const { container } = render(Kiosk);
    await settle();

    getKioskEvents.mockRejectedValue(new Error('the network is down'));
    await vi.advanceTimersByTimeAsync(60000);
    expect(container.querySelector('.main h1').textContent).toBeTruthy();
  });

  it('stops asking once the screen is gone', async () => {
    const { unmount } = render(Kiosk);
    await settle();
    unmount();
    await vi.advanceTimersByTimeAsync(180000);
    expect(getKioskEvents).toHaveBeenCalledTimes(1);
  });

  /**
   * The kiosk listing carries no colour of its own, so the organizations are
   * read once and the colour each board chose is adapted before it is drawn.
   */
  it('draws the organization mark in the adapted colour the organization chose', async () => {
    const { container } = render(Kiosk);
    await settle();
    const pad = container.querySelector('.main .org .pad');
    expect(pad.getAttribute('style')).toContain(organizationColor('#00629B', 'mark', 'dark'));
  });

  it('lists this month’s midterms and leaves the rest of the term alone', async () => {
    const { container } = render(Kiosk);
    await settle();
    expect(container.textContent).toContain('ECE 210 Midterm 1');
    expect(container.textContent).not.toContain('ECE 385');
  });

  it('says what to do when there is nothing coming up', async () => {
    getKioskEvents.mockResolvedValue({ events: [] });
    const { container } = render(Kiosk);
    await settle();
    expect(container.textContent).toContain('Nothing is coming up');
    expect(container.textContent).toContain('viaillinois.com');
  });
});
