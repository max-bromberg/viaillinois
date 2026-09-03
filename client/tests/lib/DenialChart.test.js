import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import DenialChart from '../../src/lib/DenialChart.svelte';

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
});
