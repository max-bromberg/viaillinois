import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, within } from '@testing-library/svelte';

const getEvent = vi.hoisted(() => vi.fn());
const getRso = vi.hoisted(() => vi.fn());
const showToast = vi.hoisted(() => vi.fn());

vi.mock('../../src/api/events.js', () => ({ getEvent }));
vi.mock('../../src/api/rsos.js', () => ({ getRso }));
vi.mock('../../src/stores/ui.js', async importOriginal => ({ ...await importOriginal(), showToast }));
vi.mock('../../src/lib/router.js', () => ({ navigate: vi.fn() }));
vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn().mockResolvedValue(undefined) } }));

const Poster = (await import('../../src/routes/Poster.svelte')).default;

const EVENT = {
  event_id: 1,
  title: 'Soldering night',
  description: 'Bring a project, or use one of ours.',
  start_time: '2026-09-24T18:00:00-05:00',
  end_time: '2026-09-24T20:00:00-05:00',
  building: 'Electrical & Computer Eng Bldg',
  room_number: '3017',
  tags: 'workshop,hardware',
  rso_name: 'IEEE',
};

const RSO = { rso_id: 1, name: 'IEEE', logo_color: '#b5306f' };

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.history.replaceState({}, '', '/poster?event=1&rso=1');
  getEvent.mockResolvedValue({ event: EVENT });
  getRso.mockResolvedValue({ rso: RSO });
});

/**
 * Wait until the event has arrived and the designer has laid a poster out.
 *
 * Every layer is reachable twice, as the box over it on the poster and as its
 * entry in the list beside it, so the two are asked for separately here rather
 * than the page being made to name one of them something other than what it is.
 */
async function opened() {
  const screen = render(Poster);
  const onPoster = name => within(screen.container.querySelector('.stage'))
    .getByRole('button', { name });
  const inList = name => within(screen.container.querySelector('.layers'))
    .getByRole('button', { name });
  await waitFor(() => expect(onPoster('The title')).toBeTruthy());
  return { ...screen, onPoster, inList };
}

/**
 * The poster designer.
 *
 * It used to draw one fixed layout with a handful of switches over it, so a
 * board could change the colour of a poster and which of four pieces it
 * carried, and nothing else. What it is now is an editor: a template to start
 * from, and then a stack of layers every one of which can be moved, sized,
 * restyled, reordered and taken off.
 *
 * There is no canvas in a test, so nothing here is about what was drawn. What
 * is held here is the editing: that a layer can be picked and changed, that
 * undo puts it back, and that the page still follows the design system, which
 * is the title in the condensed display face at forty pixels and one primary
 * button. See docs/design/08-surfaces.md.
 */
describe('Poster, drawn in the design system', () => {
  it('names itself the poster designer, in the name the codebase uses', async () => {
    const { getByRole } = await opened();
    expect(getByRole('heading', { level: 1, name: 'The poster designer' })).toBeTruthy();
  });

  it('carries one primary button, which is the download', async () => {
    const { container } = await opened();
    const primaries = container.querySelectorAll('.btn.primary');
    expect(primaries.length).toBe(1);
    expect(primaries[0].textContent.trim()).toBe('Download the poster');
  });

  it('names its groups without an eyebrow label and without shouting', async () => {
    const { container } = await opened();
    expect(container.querySelector('.uppercase')).toBeNull();
    expect(container.textContent).not.toMatch(/\bCOLORS\b|\bTHEME\b|\bFONT\b/);
  });
});

describe('what the designer opens on', () => {
  it('lays the event out from a template, rather than on an empty sheet', async () => {
    const { onPoster, getByRole, container } = await opened();
    expect(onPoster('The title')).toBeTruthy();
    expect(container.querySelectorAll('.hit').length).toBeGreaterThan(3);
  });

  it('offers every template as something to start again from', async () => {
    const { getByRole } = await opened();
    for (const name of ['Banner', 'Large type', 'A photograph first', 'The organization colour']) {
      expect(getByRole('button', { name: new RegExp(name) })).toBeTruthy();
    }
  });

  it('says that an event VIA does not have is nothing to make a poster of', async () => {
    getEvent.mockRejectedValue(new Error('not now'));
    const { findByText } = render(Poster);
    expect(await findByText(/nothing to make a poster of/)).toBeTruthy();
  });
});

describe('editing a poster', () => {
  it('shows what a layer is made of once it is picked', async () => {
    const { onPoster, getByRole, getByLabelText } = await opened();
    await fireEvent.pointerDown(onPoster('The title'));
    expect(getByLabelText('What it says').value).toContain('Soldering night');
  });

  it('changes the words of a layer, and the layer list follows the name', async () => {
    const { onPoster, getByRole, getByLabelText } = await opened();
    await fireEvent.pointerDown(onPoster('The title'));
    await fireEvent.input(getByLabelText('What it says'), { target: { value: 'Something else' } });
    expect(getByLabelText('What it says').value).toBe('Something else');
  });

  it('adds a layer of each kind, and puts the new one on top', async () => {
    const { onPoster, getByRole, container } = await opened();
    const before = container.querySelectorAll('.hit').length;
    await fireEvent.click(getByRole('button', { name: 'Add words' }));
    expect(container.querySelectorAll('.hit').length).toBe(before + 1);

    await fireEvent.click(getByRole('button', { name: 'Add a shape' }));
    expect(container.querySelectorAll('.hit').length).toBe(before + 2);

    await fireEvent.click(getByRole('button', { name: 'Add a picture' }));
    expect(container.querySelectorAll('.hit').length).toBe(before + 3);
  });

  it('takes a layer off the poster', async () => {
    const { onPoster, getByRole, container } = await opened();
    const before = container.querySelectorAll('.hit').length;
    await fireEvent.pointerDown(onPoster('The title'));
    await fireEvent.click(getByRole('button', { name: 'Take it off' }));
    expect(container.querySelectorAll('.hit').length).toBe(before - 1);
  });

  it('moves a layer with the arrow keys, which is the way to place one exactly', async () => {
    const { onPoster, getByRole, getByLabelText } = await opened();
    await fireEvent.pointerDown(onPoster('The title'));
    const before = Number(getByLabelText('From the left').value);
    await fireEvent.keyDown(onPoster('The title'), { key: 'ArrowRight' });
    expect(Number(getByLabelText('From the left').value)).toBe(before + 1);
  });

  it('puts the last change back when undo is pressed, and forward again on redo', async () => {
    const { onPoster, getByRole, getByLabelText } = await opened();
    await fireEvent.pointerDown(onPoster('The title'));
    await fireEvent.input(getByLabelText('What it says'), { target: { value: 'Changed' } });

    await fireEvent.click(getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(getByLabelText('What it says').value).toContain('Soldering night'));

    await fireEvent.click(getByRole('button', { name: 'Redo' }));
    await waitFor(() => expect(getByLabelText('What it says').value).toBe('Changed'));
  });

  it('has nothing to undo on a poster nobody has changed', async () => {
    const { getByRole } = await opened();
    expect(getByRole('button', { name: 'Undo' }).disabled).toBe(true);
    expect(getByRole('button', { name: 'Redo' }).disabled).toBe(true);
  });
});

describe('a design between visits', () => {
  it('keeps the design in this browser, and says that it is only this browser', async () => {
    const { container } = await opened();
    expect(container.textContent).toMatch(/this browser/i);
  });

  it('opens on the design that was saved, rather than on the template again', async () => {
    const first = await opened();
    await fireEvent.pointerDown(first.onPoster('The title'));
    await fireEvent.input(first.getByLabelText('What it says'), { target: { value: 'Kept across' } });
    first.unmount();

    const again = await opened();
    await fireEvent.pointerDown(again.onPoster('The title'));
    expect(again.getByLabelText('What it says').value).toBe('Kept across');
  });

  it('forgets the saved design when a board starts again from a template', async () => {
    const first = await opened();
    await fireEvent.pointerDown(first.onPoster('The title'));
    await fireEvent.input(first.getByLabelText('What it says'), { target: { value: 'Thrown away' } });
    await fireEvent.click(first.getByRole('button', { name: /Large type/ }));
    first.unmount();

    const again = await opened();
    await fireEvent.pointerDown(again.onPoster('The title'));
    expect(again.getByLabelText('What it says').value).toContain('Soldering night');
  });
});
