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
  archiveExpiredReservations: vi.fn().mockRejectedValue(new Error('Not implemented')),
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

/**
 * What the Tableau export actually contains.
 *
 * The poller reads seven columns by name and nothing here knows what else the export
 * carries, because the only way to find out is to look at a real download. Naming the
 * columns it did not read, once per run, turns that into something the logs answer rather
 * than something somebody has to go and check by hand. It reads nothing new and changes
 * nothing about what is stored, which matters because this collection point is delicate.
 */
describe('reporting what the export offers', () => {
  it('names the columns it received and did not use', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    downloadTableauCsv.mockResolvedValue(
      'Building,Room,Customer,EventName,StartDate,StartTime,EndTime,Department,Contact\n'
      + 'ECEB,1002,IEEE,Soldering night,4/16/2026,12/30/1899 9:00:00 AM,4/16/2026 10:00:00 AM,ECE,someone\n',
    );

    await runOnce();

    const said = log.mock.calls.map(args => args.join(' ')).join('\n');
    expect(said).toContain('Department');
    expect(said).toContain('Contact');
    log.mockRestore();
  });

  it('says nothing when every column it received is one it reads', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    downloadTableauCsv.mockResolvedValue(
      'Building,Room,Customer,EventName,StartDate,StartTime,EndTime\n'
      + 'ECEB,1002,IEEE,Soldering night,4/16/2026,12/30/1899 9:00:00 AM,4/16/2026 10:00:00 AM\n',
    );

    await runOnce();

    const said = log.mock.calls.map(args => args.join(' ')).join('\n');
    expect(said).not.toContain('columns it does not read');
    log.mockRestore();
  });
});

/** The same record of what one poll covered, for Tableau. */
describe('what a Tableau poll covered', () => {
  it('reports the first and last start time it wrote', async () => {
    const { upsertFacilityLocation, upsertReservation } = await import('../../db/queries/facilityReservations.js');
    upsertFacilityLocation.mockResolvedValueOnce(7).mockResolvedValueOnce(7);
    upsertReservation.mockResolvedValueOnce({ affectedRows: 1 }).mockResolvedValueOnce({ affectedRows: 1 });
    downloadTableauCsv.mockResolvedValue(SAMPLE_CSV);

    const result = await runOnce();

    expect(result.coverage).toEqual({
      first_start: '2026-04-15 10:00:00',
      last_start: '2026-04-16 14:00:00',
    });
    expect(result.failed).toBe(0);
  });
});
