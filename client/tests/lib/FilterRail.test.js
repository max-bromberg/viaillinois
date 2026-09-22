import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import FilterRail from '../../src/lib/FilterRail.svelte';

vi.mock('../../src/api/tags.js', () => ({
  getTags: vi.fn().mockResolvedValue({ tags: [{ tag_name: 'Workshop' }, { tag_name: 'Free Food' }] }),
}));

/**
 * The filter rail is words, not a panel.
 *
 * docs/design/08-surfaces.md: a 200 px rail of words at the left, with no panel
 * around it. Its headings are condensed 800 at 16 px. Upcoming and Past are two
 * words with the active one underlined by a Current gradient. Tags are
 * highlights. Organizations are pads and names. The internal events control is a
 * pad. Every one of those replaced a bordered box, a pill or a checkbox.
 */
const RSOS = [
  { rso_id: 1, name: 'IEEE', logo_color: '#00629B' },
  { rso_id: 2, name: 'HKN', logo_color: '#8B1E3F' },
];

/** What the rail last reported. */
function railWithSpy(props = {}) {
  const changes = [];
  const result = render(FilterRail, { rsos: RSOS, onchange: change => changes.push(change), ...props });
  return { ...result, changes };
}

describe('FilterRail', () => {
  it('is a rail of words with no panel around it', () => {
    const { container } = render(FilterRail, { rsos: RSOS });
    const rail = container.querySelector('.rail');
    expect(rail).toBeTruthy();
    expect(rail.getAttribute('style') ?? '').not.toMatch(/border|background/);
  });

  it('heads each part of the rail in words, with no label above a heading', () => {
    const { container } = render(FilterRail, { rsos: RSOS });
    const headings = [...container.querySelectorAll('.rail h3')].map(heading => heading.textContent);
    // Five headings, which is what the surfaces document lists. The date range
    // asks the same question the two words do, so it sits under When rather
    // than adding a sixth.
    expect(headings).toEqual(['When', 'Search', 'Tags', 'Organizations', 'Show']);
  });

  it('offers upcoming and past as two words, and says which is on', () => {
    const { container } = render(FilterRail, { rsos: RSOS });
    const when = container.querySelector('.rail .when');
    // The two words are set apart by the rail's own gap rather than by a space
    // in the markup, so they are read as two words rather than as one string.
    expect([...when.querySelectorAll('button')].map(word => word.textContent.trim())).toEqual(['Upcoming', 'Past']);
    expect(when.querySelector('[aria-pressed="true"]').textContent.trim()).toBe('Upcoming');
  });

  it('asks for the past when the reader switches to it', async () => {
    const { getByRole, changes } = railWithSpy();
    await fireEvent.click(getByRole('button', { name: 'Past' }));
    expect(changes.at(-1).timeframe).toBe('archived');
  });

  it('draws the tags as highlights, unselected until they are chosen', async () => {
    const { container } = render(FilterRail, { rsos: RSOS });
    await waitFor(() => expect(container.querySelectorAll('.rail .hl').length).toBeGreaterThan(0));
    for (const tag of container.querySelectorAll('.rail .hlrow .hl')) {
      expect(tag.classList.contains('off')).toBe(true);
      expect(tag.getAttribute('aria-pressed')).toBe('false');
    }
  });

  it('lights a tag when it is chosen, and reports it', async () => {
    const { container, changes } = railWithSpy();
    await waitFor(() => expect(container.querySelector('.rail .hlrow .hl')).toBeTruthy());
    const tag = [...container.querySelectorAll('.rail .hlrow .hl')].find(node => node.textContent === 'Workshop');
    await fireEvent.click(tag);
    expect(changes.at(-1).tags).toEqual(['Workshop']);
    expect(tag.classList.contains('off')).toBe(false);
    expect(tag.getAttribute('aria-pressed')).toBe('true');
  });

  it('lists the organizations as a pad and a name, with no coloured square', () => {
    const { container } = render(FilterRail, { rsos: RSOS });
    const orgs = [...container.querySelectorAll('.rail .orgs > *')];
    expect(orgs).toHaveLength(2);
    expect(orgs[0].textContent).toContain('IEEE');
    expect(orgs[0].querySelector('.pad')).toBeTruthy();
    // The colour is adapted before it is drawn, never shown as it was stored.
    expect(orgs[0].innerHTML).not.toContain('00629B');
  });

  it('hollows the pad of an organization that is filtered out, so the state is a shape', async () => {
    const { container, changes } = railWithSpy();
    const first = container.querySelector('.rail .orgs > *');
    await fireEvent.click(first);
    expect(changes.at(-1).selectedRsoIds).toEqual([1]);
    // Choosing one organization leaves the others out, and a pad that is out is
    // hollow rather than merely a different colour.
    const pads = [...container.querySelectorAll('.rail .orgs .pad')];
    expect(pads[0].classList.contains('hollow')).toBe(false);
    expect(pads[1].classList.contains('hollow')).toBe(true);
  });

  it('offers internal events as a pad rather than as a checkbox', async () => {
    const { container, changes } = railWithSpy();
    const show = container.querySelector('.rail .check');
    expect(show.textContent).toContain('Internal events');
    expect(show.querySelector('.pad')).toBeTruthy();
    expect(show.getAttribute('role')).toBe('checkbox');
    expect(show.getAttribute('aria-checked')).toBe('true');
    await fireEvent.click(show);
    expect(changes.at(-1).showInternal).toBe(false);
  });

  it('searches by keyword, from a field with no box around it', async () => {
    const { container, changes } = railWithSpy();
    const search = container.querySelector('.rail .fld input');
    expect(search).toBeTruthy();
    await fireEvent.input(search, { target: { value: 'PCB' } });
    expect(changes.at(-1).keyword).toBe('PCB');
  });

  it('offers a way back to everything once something has been filtered', async () => {
    const { container, queryByRole, findByRole } = render(FilterRail, { rsos: RSOS, onchange: () => {} });
    expect(queryByRole('button', { name: /clear/i })).toBe(null);
    await fireEvent.click(container.querySelector('.rail .orgs > *'));
    expect(await findByRole('button', { name: /clear/i })).toBeTruthy();
  });

  it('puts everything back when it is cleared', async () => {
    const { container, findByRole, changes } = railWithSpy();
    await fireEvent.click(container.querySelector('.rail .orgs > *'));
    await fireEvent.click(await findByRole('button', { name: /clear/i }));
    expect(changes.at(-1)).toMatchObject({
      keyword: '', tags: [], selectedRsoIds: [], showInternal: true, timeframe: 'upcoming',
    });
  });
});

/**
 * The rail folds away on a phone.
 *
 * The page grid puts the rail above the agenda once the screen is narrower than
 * 900 px, and the rail is five headings tall, so on a phone the agenda the
 * reader came for started below the fold. The calendar's rail already folded
 * behind an opener, and this is the same shape of control in the same place.
 */
describe('the rail on a phone', () => {
  it('offers an opener that says whether it is open', async () => {
    const { getByRole } = render(FilterRail, { rsos: RSOS });
    const opener = getByRole('button', { name: /filters/i });
    expect(opener.getAttribute('aria-expanded')).toBe('false');
    await fireEvent.click(opener);
    expect(opener.getAttribute('aria-expanded')).toBe('true');
  });

  it('names what the opener opens, so the control and the panel are tied together', () => {
    const { container, getByRole } = render(FilterRail, { rsos: RSOS });
    const opener = getByRole('button', { name: /filters/i });
    const id = opener.getAttribute('aria-controls');
    expect(id).toBeTruthy();
    expect(container.querySelector(`#${id}`)).toBeTruthy();
  });

  it('says on the opener that some of the filters are on', async () => {
    const { container, getByRole } = render(FilterRail, { rsos: RSOS, onchange: () => {} });
    const opener = getByRole('button', { name: /filters/i });
    expect(opener.querySelector('.pad.hollow')).toBeTruthy();
    await fireEvent.click(container.querySelector('.rail .orgs > *'));
    expect(opener.querySelector('.pad.hollow')).toBe(null);
  });

  it('leaves the rail open on a wide screen, where the opener is not drawn', () => {
    const { container } = render(FilterRail, { rsos: RSOS });
    const groups = container.querySelector('.rail .groups');
    expect(groups).toBeTruthy();
    expect(container.querySelectorAll('.rail .groups h3').length).toBeGreaterThan(3);
  });
});
