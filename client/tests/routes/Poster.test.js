import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';

const getEvent = vi.hoisted(() => vi.fn());
const getRso = vi.hoisted(() => vi.fn());
const showToast = vi.hoisted(() => vi.fn());

vi.mock('../../src/api/events.js', () => ({ getEvent }));
vi.mock('../../src/api/rsos.js', () => ({ getRso }));
vi.mock('../../src/stores/ui.js', async importOriginal => ({ ...await importOriginal(), showToast }));
vi.mock('../../src/lib/router.js', () => ({ navigate: vi.fn() }));
vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn() } }));

const Poster = (await import('../../src/routes/Poster.svelte')).default;

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/poster?event=1&rso=1');
  // The drawing itself is not what is under test here, and jsdom has no canvas
  // to draw on, so the event never arrives and the preview is never rendered.
  getEvent.mockRejectedValue(new Error('not now'));
  getRso.mockRejectedValue(new Error('not now'));
});

/**
 * The poster designer is a board tool, so it follows the same rules as the rest
 * of the site with less ceremony: the page title in the condensed display face
 * at forty pixels, the switch for a setting that is on or off, one primary
 * button, and no eyebrow labels over the groups. See docs/design/08-surfaces.md.
 */
describe('Poster, drawn in the design system', () => {
  it('names itself the poster designer, in the name the codebase uses', () => {
    const { getByRole } = render(Poster);
    expect(getByRole('heading', { level: 1, name: 'The poster designer' })).toBeTruthy();
  });

  it('offers each piece of the poster as a switch', () => {
    const { getByRole } = render(Poster);
    for (const name of ['Description', 'Date and time', 'Location', 'Tags']) {
      expect(getByRole('switch', { name }).getAttribute('aria-checked')).toBe('true');
    }
  });

  it('turns a piece of the poster off when its switch is turned', async () => {
    const { getByRole } = render(Poster);
    const tags = getByRole('switch', { name: 'Tags' });
    tags.click();
    await Promise.resolve();
    expect(getByRole('switch', { name: 'Tags' }).getAttribute('aria-checked')).toBe('false');
  });

  it('carries one primary button, which is the download', () => {
    const { container } = render(Poster);
    const primaries = container.querySelectorAll('.btn.primary');
    expect(primaries.length).toBe(1);
    expect(primaries[0].textContent.trim()).toBe('Download the poster');
  });

  it('names its groups without an eyebrow label and without shouting', () => {
    const { container } = render(Poster);
    expect(container.querySelector('.uppercase')).toBeNull();
    expect(container.textContent).not.toMatch(/\bCOLORS\b|\bTHEME\b|\bFONT\b/);
  });
});
