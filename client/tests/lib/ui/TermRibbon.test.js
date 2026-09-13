import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { TermRibbon } from '../../../src/lib/components/ui/TermRibbon/index.js';

/**
 * The term ribbon is the midterms page read as a heat map. One cell stands for
 * one week, its ground warms with the number of exams in that week, and the
 * count is printed on every cell so that a reader who cannot tell the warm
 * cells from the cool ones still has the number.
 *
 * See docs/design/07-components.md, the term ribbon, and the midterms block of
 * docs/design/foundation.html, which is the render this is measured against.
 */
describe('TermRibbon', () => {
  const WEEKS = [
    { start: '2026-08-24', count: 0 },
    { start: '2026-08-31', count: 0 },
    { start: '2026-09-07', count: 1 },
    { start: '2026-09-14', count: 3 },
    { start: '2026-09-21', count: 2 },
  ];

  const cellsOf = container => [...container.querySelectorAll('.ribbon .wkc')];
  const heatOf = cell => Number(cell.style.getPropertyValue('--heat'));

  it('draws one cut cell for each week of the term', () => {
    const { container } = render(TermRibbon, { weeks: WEEKS });
    const cells = cellsOf(container);
    expect(cells).toHaveLength(WEEKS.length);
    for (const cell of cells) {
      expect(cell.classList.contains('cut')).toBe(true);
    }
  });

  it('prints the count on every week, including the weeks that hold no exams', () => {
    const { container } = render(TermRibbon, { weeks: WEEKS });
    const counts = cellsOf(container).map(cell => cell.querySelector('b').textContent);
    expect(counts).toEqual(['0', '0', '1', '3', '2']);
  });

  /**
   * The ground is a mix of the well and the signal colour, and the stylesheet
   * reads how far along that mix to go from the --heat custom property. An empty
   * week is the well itself, and a busier week is always warmer than a quieter
   * one.
   */
  it('warms a cell toward the signal colour with the number of exams in its week', () => {
    const { container } = render(TermRibbon, {
      weeks: [
        { start: '2026-08-24', count: 0 },
        { start: '2026-08-31', count: 1 },
        { start: '2026-09-07', count: 2 },
        { start: '2026-09-14', count: 4 },
      ],
    });
    const heats = cellsOf(container).map(heatOf);
    expect(heats[0]).toBe(0);
    expect(heats[1]).toBeGreaterThan(heats[0]);
    expect(heats[2]).toBeGreaterThan(heats[1]);
    expect(heats[3]).toBeGreaterThan(heats[2]);
  });

  /**
   * A week heavier than any the ramp was drawn for still has to stay inside the
   * mix, because a proportion above one hundred percent is not a colour.
   */
  it('stops warming at the signal colour, however heavy the week is', () => {
    const { container } = render(TermRibbon, { weeks: [{ start: '2026-10-05', count: 40 }] });
    expect(heatOf(cellsOf(container)[0])).toBe(100);
  });

  it('sets the count in signal text from three exams onward, and not below', () => {
    const { container } = render(TermRibbon, { weeks: WEEKS });
    const hot = cellsOf(container).map(cell => cell.classList.contains('hot'));
    expect(hot).toEqual([false, false, false, true, false]);
  });

  it('marks the current week and says which one it is in words as well', () => {
    const { container } = render(TermRibbon, { weeks: WEEKS, current: '2026-09-07' });
    const cells = cellsOf(container);
    expect(cells.map(cell => cell.classList.contains('now'))).toEqual([false, false, true, false, false]);
    expect(cells[2].getAttribute('aria-current')).toBe('date');
    expect(cells[2].getAttribute('aria-label')).toContain('This is the current week.');
  });

  it('marks no week when the caller has not said which week it is', () => {
    const { container } = render(TermRibbon, { weeks: WEEKS });
    expect(container.querySelector('.ribbon .wkc.now')).toBe(null);
  });

  it('tells a screen reader what each week holds, in a complete sentence', () => {
    const { container } = render(TermRibbon, { weeks: WEEKS });
    const labels = cellsOf(container).map(cell => cell.getAttribute('aria-label'));
    expect(labels[0]).toBe('Week of Aug 24 has no exams.');
    expect(labels[2]).toBe('Week of Sep 7 has 1 exam.');
    expect(labels[3]).toBe('Week of Sep 14 has 3 exams.');
  });

  it('writes the week date in mono and carries the machine readable date with it', () => {
    const { container } = render(TermRibbon, { weeks: WEEKS });
    const dates = cellsOf(container).map(cell => cell.querySelector('span time'));
    expect(dates.map(date => date.getAttribute('datetime'))).toEqual(WEEKS.map(week => week.start));
    expect(dates[0].textContent).toBe('Aug 24');
    expect(dates[3].textContent).toBe('Sep 14');
  });

  it('sits a caption row under the ribbon, saying what the cells count', () => {
    const { container } = render(TermRibbon, { weeks: WEEKS, note: '4 of 6 confirmed' });
    const caption = container.querySelector('.ribcap');
    expect(caption).toBeTruthy();
    expect(caption.previousElementSibling.classList.contains('ribbon')).toBe(true);
    expect(caption.textContent).toContain('exams per week');
    expect(caption.textContent).toContain('4 of 6 confirmed');
  });

  it('takes a caption of the caller’s own', () => {
    const { container } = render(TermRibbon, { weeks: WEEKS, caption: 'exams per week, Fall 2026' });
    expect(container.querySelector('.ribcap').textContent).toContain('exams per week, Fall 2026');
  });

  it('draws nothing at all when the term has no weeks in it yet', () => {
    const { container } = render(TermRibbon, { weeks: [] });
    expect(container.querySelector('.ribbon')).toBe(null);
    expect(container.querySelector('.ribcap')).toBe(null);
  });
});
