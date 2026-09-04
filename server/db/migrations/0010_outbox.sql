-- What changed, in the order it changed, for the Discord bot to act on.
--
-- The bot posts announcements, edits them when an event moves, and tells people what they
-- asked to be told. It needs to hear about every change, in order, and it must not miss one
-- while it is restarting. Polling the tables for differences would mean every reader
-- reimplementing "what is new since I last looked". This table answers that question
-- directly: each change writes one entry, and a reader keeps the identifier it last handled
-- and asks for everything after it.
--
-- The identifier is the cursor, so it is a bigint that only grows. rso_id is copied out of
-- the payload for anything that belongs to an RSO, so a reader can route an entry to the
-- servers that follow that RSO without a second query. The payload is a snapshot of the
-- subject after the change, and for an update the fields that changed, so that in the
-- common case the reader can act without fetching anything else.
--
-- The web platform does not record what any reader has read. That keeps the endpoint
-- serving this table stateless and lets a second reader appear without a change here.
-- Entries are pruned after thirty days; a reader further behind than that reconciles from
-- the listing endpoints instead.
CREATE TABLE `Outbox` (
	`outbox_id` bigint AUTO_INCREMENT NOT NULL,
	`kind` varchar(40) NOT NULL,
	`subject_type` varchar(20) NOT NULL,
	`subject_id` varchar(40) NOT NULL,
	`rso_id` int,
	`payload` json NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `Outbox_outbox_id` PRIMARY KEY(`outbox_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_outbox_created` ON `Outbox` (`created_at`);
