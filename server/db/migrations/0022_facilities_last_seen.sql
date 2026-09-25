-- When each source last showed a booking.
--
-- Nothing removes a booking that a source stops reporting. Both pollers only upsert, and
-- the only statement that takes a row out of the working set is the archive, which selects
-- by end time alone. So a booking cancelled in Ad Astra, or moved to another room or hour,
-- keeps its row until its date passes and is then written to history exactly like a
-- booking that went ahead. A moved booking reaches history twice, once at each slot, under
-- the same activity identifier. Once it is there nothing can tell which copy happened,
-- which is the same kind of loss migration 0021 exists to prevent. VISION.md has the
-- reasoning.
--
-- The last sighting from each source is what makes the difference recoverable. A booking
-- whose last sighting predates a clean poll from the same source that covered its date was
-- not in that poll, and the poll log records what each poll covered. The answer is
-- worked out later from data that is kept, not guessed now and written in as a status.
--
-- Two columns per table rather than a log of sightings, for the same reason first seen is
-- two columns: a row per booking per poll would cost gigabytes to answer what ten bytes
-- answers.
--
-- Nullable with no backfill. scraped_at already holds the last sighting from either source,
-- but it cannot say which, and writing it into both columns would record sightings that
-- never happened. Every booking still reported is stamped by the next poll from each source
-- that reports it, so null soon means only what it should: that source has not shown this
-- booking since this migration ran.
ALTER TABLE `Facility_Reservations`
  ADD COLUMN `astra_last_seen` datetime DEFAULT NULL,
  ADD COLUMN `tableau_last_seen` datetime DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `Facility_Reservation_History`
  ADD COLUMN `astra_last_seen` datetime DEFAULT NULL,
  ADD COLUMN `tableau_last_seen` datetime DEFAULT NULL;
