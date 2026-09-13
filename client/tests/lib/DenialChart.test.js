import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import DenialChart from '../../src/lib/DenialChart.svelte';
import { tagHue } from '../../src/lib/tagHue.js';

/**
 * A week of nothing here is the normal reading, and it has to look like a
 * deliberate nothing rather than like a component that failed to load.
 */
describe('DenialChart', () => {
  it('says plainly when nobody was turned away', () => {
    render(DenialChart, { series: [] });
    expect(screen.getByText(/Nobody was turned away/i)).toBeTruthy();
  });

  it('shows a day, a reason and a count', () => {
    render(DenialChart, { series: [
      { day: '2026-09-03', reason: 'overloaded', denials: 12, clients: 3 },
    ] });
    expect(screen.getByText('overloaded')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
  });

  it('names the busiest reason first, because that is the one to act on', () => {
    render(DenialChart, { series: [
      { day: '2026-09-03', reason: 'overloaded', denials: 2, clients: 1 },
      { day: '2026-09-03', reason: 'row_budget', denials: 40, clients: 1 },
    ] });
    const rows = screen.getAllByRole('row');
    expect(rows[1].textContent).toContain('row_budget');
  });

  /**
   * The counts are drawn as well as printed, and a bar is drawn in the reason's
   * own hue out of the eight the colour document gives. No hue is invented
   * here, and no raw value appears outside the token file.
   */
  it('draws each count as a bar in the hue of its reason, scaled against the busiest', () => {
    const { container } = render(DenialChart, { series: [
      { day: '2026-09-03', reason: 'overloaded', denials: 10, clients: 1 },
      { day: '2026-09-03', reason: 'row_budget', denials: 40, clients: 1 },
    ] });
    const bars = [...container.querySelectorAll('.bar')];
    expect(bars.length).toBe(2);
    expect(bars[0].getAttribute('style')).toContain(`--h: ${tagHue('row_budget')}`);
    expect(bars[0].getAttribute('style')).toContain('--part: 100%');
    expect(bars[1].getAttribute('style')).toContain('--part: 25%');
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });

  /** A count is data, and data is set in the mono face with tabular figures. */
  it('sets the counts in the data face', () => {
    const { container } = render(DenialChart, { series: [
      { day: '2026-09-03', reason: 'overloaded', denials: 12, clients: 3 },
    ] });
    expect(screen.getByText('12').classList.contains('mono')).toBe(true);
    expect(container.querySelector('td').classList.contains('mono')).toBe(true);
  });

  it('says what each reason means, in words', () => {
    render(DenialChart, { series: [
      { day: '2026-09-03', reason: 'pool_exhausted', denials: 3, clients: 1 },
    ] });
    expect(screen.getByText(/database connection queue was full/i)).toBeTruthy();
  });
});
