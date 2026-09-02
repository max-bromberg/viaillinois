-- An event can repeat. A weekly meeting, a fortnightly design review, office hours on a
-- Tuesday and a Thursday: most of what an RSO holds is one of these, and until now each
-- week of it had to be entered by hand.
--
-- The rule lives in Event_Series and every occurrence is an ordinary Events row pointing
-- back at it. That way nothing which reads events has to learn about recurrence: the feed,
-- the calendar, the kiosk, room conflict detection, the sitemap and the structured data all
-- keep working, because what they see is still events. The cost is a row per occurrence,
-- which for a term of weekly meetings is about sixteen.
--
-- Every other week is stored as an interval rather than as a second frequency. A calendar
-- file can carry any interval, and recording the number it gave is simpler than deciding
-- which intervals have names.
--
-- days_of_week holds short day names in the order a week runs, so Mon,Tue,Wed,Thu,Fri,Sat,Sun
-- at its longest, which is 27 characters.
--
-- detached marks an occurrence that was edited on its own. A later edit to the whole series
-- leaves it alone, so the week that moved to another room stays moved.
CREATE TABLE `Event_Series` (
	`series_id` int AUTO_INCREMENT NOT NULL,
	`rso_id` int NOT NULL,
	`created_by` varchar(20) NOT NULL,
	`frequency` varchar(20) NOT NULL DEFAULT 'weekly',
	`interval_weeks` int NOT NULL DEFAULT 1,
	`days_of_week` varchar(27) NOT NULL,
	`starts_on` date NOT NULL,
	`ends_on` date NOT NULL,
	`start_of_day` time NOT NULL,
	`duration_minutes` int NOT NULL,
	`external_uid` varchar(255),
	CONSTRAINT `Event_Series_series_id` PRIMARY KEY(`series_id`),
	CONSTRAINT `uq_series_external_uid` UNIQUE(`rso_id`,`external_uid`),
	CONSTRAINT `chk_series_dates` CHECK((`ends_on` >= `starts_on`)),
	CONSTRAINT `chk_series_interval` CHECK((`interval_weeks` >= 1))
);
--> statement-breakpoint
ALTER TABLE `Event_Series` ADD CONSTRAINT `Event_Series_ibfk_1` FOREIGN KEY (`rso_id`) REFERENCES `RSOs`(`rso_id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `Event_Series` ADD CONSTRAINT `Event_Series_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `Users`(`net_id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `Events` ADD COLUMN `series_id` int;
--> statement-breakpoint
ALTER TABLE `Events` ADD COLUMN `detached` tinyint NOT NULL DEFAULT 0;
--> statement-breakpoint
-- Deleting a series deletes its occurrences, which is what deleting a series means.
ALTER TABLE `Events` ADD CONSTRAINT `Events_ibfk_4` FOREIGN KEY (`series_id`) REFERENCES `Event_Series`(`series_id`) ON DELETE cascade ON UPDATE no action;
