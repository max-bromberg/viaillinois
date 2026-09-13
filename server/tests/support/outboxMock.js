import { vi } from 'vitest';

/**
 * The outbox, as a set of spies that write nothing.
 *
 * Every controller that changes something now leaves an entry for the Discord
 * bot, and the entry is written against the database. A suite in the unit
 * project has no database, so it mocks this module and asserts the behaviour
 * it is actually about. What the entries themselves say is asserted in the
 * database project, against a real table, in tests/db/outboxWriters.db.test.js.
 *
 * Use it as:
 *   vi.mock('../../db/queries/outbox.ts', async () =>
 *     (await import('../support/outboxMock.js')).outboxMock());
 */
export function outboxMock() {
  return {
    writeOutbox: vi.fn(),
    writeOutboxOnConnection: vi.fn(),
    readOutbox: vi.fn().mockResolvedValue([]),
    pruneOutbox: vi.fn().mockResolvedValue(0),
    eventSnapshot: vi.fn().mockResolvedValue(null),
    eventSnapshotOnConnection: vi.fn().mockResolvedValue(null),
    seriesSnapshot: vi.fn().mockResolvedValue(null),
    seriesEventIds: vi.fn().mockResolvedValue([]),
    midtermSnapshot: vi.fn().mockResolvedValue(null),
    changedFields: vi.fn().mockReturnValue([]),
    recordEventCreated: vi.fn(),
    recordEventCreatedOnConnection: vi.fn(),
    recordEventUpdated: vi.fn(),
    recordEventCancelled: vi.fn(),
    recordEventDeleted: vi.fn(),
    recordSeriesCreated: vi.fn(),
    recordSeriesUpdated: vi.fn(),
    recordSeriesDeleted: vi.fn(),
    recordMidtermChanged: vi.fn(),
    recordMidtermDeleted: vi.fn(),
    recordMembershipChanged: vi.fn(),
    recordLinkCompleted: vi.fn(),
    recordLinkRevoked: vi.fn(),
  };
}
