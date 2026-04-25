// server/tests/services/facilitiesPoller.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock tableauSession before importing the poller
vi.mock('../../services/tableauSession.js', () => ({
  downloadTableauCsv: vi.fn(),
}));

vi.mock('../../lib/locationNormalizer.js', () => ({
  resolveBuilding: vi.fn(s => s),
  resolveRoom:     vi.fn(s => s?.trim() ?? ''),
}));

// Mock DB stubs so they behave as "not implemented" (the poller already tolerates this)
vi.mock('../../db/queries/facilityReservations.js', () => ({
  upsertFacilityLocation:    vi.fn().mockRejectedValue(new Error('Not implemented')),
  upsertReservation:         vi.fn().mockRejectedValue(new Error('Not implemented')),
  deleteExpiredReservations: vi.fn().mockRejectedValue(new Error('Not implemented')),
  countReservations:         vi.fn().mockRejectedValue(new Error('Not implemented')),
}));

import { downloadTableauCsv } from '../../services/tableauSession.js';
import { runOnce } from '../../services/facilitiesPoller.js';

const SAMPLE_CSV = `Building,Room,Customer,EventName,StartDate,StartTime,EndTime
ECE Building,3002,IEEE,Tech Talk,04/15/2026,"12/30/1899 10:00:00 AM","04/15/2026 11:00:00 AM"
ECE Building,3002,ACM,Hackathon Kickoff,04/16/2026,"12/30/1899 2:00:00 PM","04/16/2026 4:00:00 PM"
`;

const INCOMPLETE_ROW_CSV = `Building,Room,Customer,EventName,StartDate,StartTime,EndTime
ECE Building,,IEEE,Tech Talk,04/15/2026,"12/30/1899 10:00:00 AM","04/15/2026 11:00:00 AM"
`;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('facilitiesPoller.runOnce()', () => {
  it('returns upserted count equal to valid row count when DB stubs are pending', async () => {
    downloadTableauCsv.mockResolvedValue(SAMPLE_CSV);
    const result = await runOnce();
    // Both rows are valid; stub errors are tolerated and counted as upserted
    expect(result.upserted).toBe(2);
    expect(result.skipped).toBe(0);
  });

  it('skips rows missing required fields', async () => {
    downloadTableauCsv.mockResolvedValue(INCOMPLETE_ROW_CSV);
    const result = await runOnce();
    expect(result.skipped).toBe(1);
    expect(result.upserted).toBe(0);
  });

  it('returns { upserted: 0, skipped: 0 } when CSV has no data rows', async () => {
    downloadTableauCsv.mockResolvedValue('Building,Room,Customer,EventName,StartDate,StartTime,EndTime\n');
    const result = await runOnce();
    expect(result.upserted).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it('throws when downloadTableauCsv rejects', async () => {
    downloadTableauCsv.mockRejectedValue(new Error('Tableau unreachable'));
    await expect(runOnce()).rejects.toThrow('Tableau unreachable');
  });
});
