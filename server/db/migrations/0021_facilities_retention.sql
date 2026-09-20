-- Keeping what the facilities pollers collect, instead of destroying it.
--
-- Until now deleteExpiredReservations ran inside both pollers on every cycle, so a
-- reservation was deleted within hours of the event happening and VIA never retained a
-- single completed booking. The Astra request also asks for eighteen fields and stored
-- four, discarding the identity of a booking, its type, its series, its section and its
-- instructor. Neither loss can be repaired later, which is why this migration comes first.
-- VISION.md has the reasoning.
--
-- The shape here is chosen for a small VPS rather than for elegance. There are two ideas
-- in it.
--
-- The first is the split between working set and history. Every hot reader (the conflict
-- check, the free room search, the scheduler) only ever asks about the present and the
-- future, so Facility_Reservations stays exactly what it is: a bounded working set of the
-- rolling window the pollers fetch, currently about a hundred and eighty days of the whole
-- Urbana campus. Expired rows leave it exactly as they did before, so no existing reader
-- changes behaviour at all. They are moved into history rather than deleted, which is the
-- entire point of this work, and history is never read by anything on a request path.
--
-- The second is that history normalises its text and the working set does not. The working
-- set is bounded, so storing the event name inline costs a fixed amount and keeps the
-- delicate poller write path simple. History grows without bound, and its text repeats
-- enormously: one course section that meets three times a week for sixteen weeks writes
-- the same name and the same instructor forty eight times. Pointing those at one dictionary
-- row turns about ninety bytes of repeated text per row into sixteen bytes of identifiers.
--
-- The numbers, at roughly a million rows a year, which is the order the Ad Astra window
-- suggests for the whole Urbana campus. Stored inline with an index on every column worth
-- querying, history costs about three hundred and ten megabytes a year, of which a hundred
-- and twenty is index. Normalised, with the two indexes below, it costs about a hundred and
-- seventy. That is a worthwhile saving on a single VPS rather than a dramatic one, and it
-- is written down here so that nobody has to take it on trust.
ALTER TABLE `Facility_Reservations`
  ADD COLUMN `activity_id` varchar(40) DEFAULT NULL,
  ADD COLUMN `parent_activity_id` varchar(40) DEFAULT NULL,
  -- Ad Astra's own event identifier, which is what a booking that is an event rather than
  -- a class carries. Named for its source so that it is never mistaken for Events.event_id,
  -- which is VIA's own and unrelated.
  ADD COLUMN `astra_event_id` varchar(40) DEFAULT NULL,
  ADD COLUMN `activity_type` varchar(32) DEFAULT NULL,
  ADD COLUMN `section_id` varchar(32) DEFAULT NULL,
  ADD COLUMN `instructor` varchar(200) DEFAULT NULL,
  ADD COLUMN `astra_first_seen` datetime DEFAULT NULL,
  ADD COLUMN `tableau_first_seen` datetime DEFAULT NULL;
--> statement-breakpoint
-- The identity a booking has in Ad Astra, which is the only way to recognise a booking
-- that moved as the same booking rather than as one that ended and another that began.
-- Indexed because matching a working set row against a history row is what asks for it.
CREATE INDEX `idx_facility_reservations_activity` ON `Facility_Reservations` (`activity_id`);
--> statement-breakpoint
-- The strings history points at instead of repeating.
--
-- The column is a hundred and ninety one characters and the unique key covers the whole of
-- it, rather than the column being longer with a prefix key over part of it. That choice is
-- about correctness rather than size. With a prefix key, two values agreeing for the first
-- hundred and ninety one characters collide on insert so only one is stored, and a join on
-- exact equality then finds nothing for the other and silently records it as having no name
-- at all. Truncating on the way in and on the way out instead means both simply resolve to
-- the same shortened name, which is a merge somebody can see rather than a loss nobody can.
--
-- A hundred and ninety one is the length that keeps a utf8mb4 unique key comfortably inside
-- the index limit. Room booking titles are far shorter than that in practice.
CREATE TABLE `Facility_Text` (
  `text_id` int unsigned AUTO_INCREMENT NOT NULL,
  `value` varchar(191) NOT NULL,
  CONSTRAINT `Facility_Text_text_id` PRIMARY KEY(`text_id`),
  CONSTRAINT `uq_facility_text_value` UNIQUE(`value`)
);
--> statement-breakpoint
-- Every reservation that has already happened.
--
-- There is deliberately no foreign key on location_id. History has to outlive the things it
-- refers to: a room that leaves the Locations table should not take the record of what
-- happened in it with it, and a cascade here would quietly destroy exactly the data this
-- migration exists to keep.
--
-- Two indexes, not four. An index on a table that only grows is a cost paid for ever, and
-- the four that first suggested themselves came to a hundred and twenty megabytes a year
-- against a hundred and fifteen of actual data. Nothing on a request path reads this table,
-- so a query that has to scan is a query that takes a few seconds in a job nobody is
-- waiting on, which is the right thing to spend when storage is the scarcer resource.
--
-- Time is indexed because it is the axis nearly every question starts from. The activity
-- identifier is indexed because matching a row in the working set against its own history
-- is a lookup rather than a scan, and it is the one thing here that a feature will depend
-- on. Location and the parent activity are deliberately left unindexed: asking how one room
-- is used, or following one recurring series, seeks by time first and filters. Add either
-- when a real query proves it needs it, which is the right order.
CREATE TABLE `Facility_Reservation_History` (
  -- int rather than bigint. At the order of a million rows a year this lasts four thousand
  -- years, and the four bytes saved are paid again in every index entry.
  `history_id` int unsigned AUTO_INCREMENT NOT NULL,
  `location_id` int NOT NULL,
  `start_time` datetime NOT NULL,
  `end_time` datetime NOT NULL,
  `activity_id` varchar(40) DEFAULT NULL,
  `parent_activity_id` varchar(40) DEFAULT NULL,
  `astra_event_id` varchar(40) DEFAULT NULL,
  `section_id` varchar(32) DEFAULT NULL,
  `event_name_id` int unsigned DEFAULT NULL,
  `customer_id` int unsigned DEFAULT NULL,
  `instructor_id` int unsigned DEFAULT NULL,
  `activity_type_id` int unsigned DEFAULT NULL,
  `source` set('tableau','astra') NOT NULL DEFAULT 'astra',
  -- When each source first showed this booking, which is what answers how long one took to
  -- agree with the other. Carried across from the working set rather than recomputed.
  `astra_first_seen` datetime DEFAULT NULL,
  `tableau_first_seen` datetime DEFAULT NULL,
  `archived_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `Facility_Reservation_History_history_id` PRIMARY KEY(`history_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_frh_start` ON `Facility_Reservation_History` (`start_time`);
--> statement-breakpoint
CREATE INDEX `idx_frh_activity` ON `Facility_Reservation_History` (`activity_id`);
--> statement-breakpoint
-- When an organizer entered an event, which VIA has never recorded.
--
-- Nullable with no backfill on purpose. Every row that predates this migration has an
-- unknown creation time, and filling those with the moment the migration ran would put a
-- confident wrong answer where the honest answer is that nobody wrote it down. Null means
-- unknown, and any question about how far in advance organizers plan has to say so rather
-- than counting a thousand events as created on the day of the deploy.
--
-- The default is added in a second statement so that existing rows keep their null while
-- every row written from now on carries the moment it was written.
ALTER TABLE `Events` ADD COLUMN `created_at` datetime DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `Events` MODIFY COLUMN `created_at` datetime DEFAULT CURRENT_TIMESTAMP;
