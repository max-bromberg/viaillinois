import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/router.js', () => ({ navigate }));
vi.mock('../../src/lib/updates.js', () => ({ allUpdates: [], formatDate: d => d }));

const Updates = (await import('../../src/routes/Updates.svelte')).default;

beforeEach(() => navigate.mockClear());

/**
 * The updates listing lives inside About now. The address it used to have is
 * still linked to from elsewhere on the web, so it leads to where the listing
 * went rather than to nothing.
 */
describe('the old updates address', () => {
  it('leads to the updates inside About', async () => {
    render(Updates);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/about/updates'));
  });
});
