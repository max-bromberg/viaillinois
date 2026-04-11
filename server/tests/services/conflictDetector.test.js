import { describe, it, expect, vi } from 'vitest';

vi.mock('../../db/queries/locations.js', () => ({
  getOccupiedDuring: vi.fn(),
}));

const { checkConflict } = await import('../../services/conflictDetector.js');
const { getOccupiedDuring } = await import('../../db/queries/locations.js');

describe('checkConflict()', () => {
  it('returns false when location is not occupied', async () => {
    getOccupiedDuring.mockResolvedValueOnce([{ location_id: 2 }, { location_id: 3 }]);
    const result = await checkConflict(1, '2026-04-01 18:00:00', '2026-04-01 20:00:00');
    expect(result).toBe(false);
  });

  it('returns true when location_id is in occupied list', async () => {
    getOccupiedDuring.mockResolvedValueOnce([{ location_id: 1 }, { location_id: 5 }]);
    const result = await checkConflict(1, '2026-04-01 18:00:00', '2026-04-01 20:00:00');
    expect(result).toBe(true);
  });

  it('passes excludeEventId to getOccupiedDuring', async () => {
    getOccupiedDuring.mockResolvedValueOnce([{ location_id: 1 }]);
    const result = await checkConflict(1, '2026-04-01 18:00:00', '2026-04-01 20:00:00', 42);
    expect(result).toBe(true);
    expect(getOccupiedDuring).toHaveBeenCalledWith(
      '2026-04-01 18:00:00', '2026-04-01 20:00:00', 42
    );
  });
});
