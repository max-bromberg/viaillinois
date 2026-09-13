-- A repeat can be more than every week or every other week.
--
-- Those were the only two shapes the form offered and the only two the rule could hold, so
-- a board holding a meeting once a month, or on a set of dates that follow no rule at all,
-- entered each one by hand. Three shapes now, all of them still a rule row plus one
-- ordinary event row per occurrence, so nothing that reads events has to learn anything.
--
-- The interval is counted in the unit its own shape counts in. interval_weeks becomes
-- nullable because a monthly rule has no number of weeks and a set of picked dates has no
-- interval at all, there being no rule between one date and the next. The rows already
-- stored are weekly rules with a real number of weeks, so nothing about them changes.
--
-- month_day and month_week are the two shapes a monthly rule can take, and a rule is only
-- ever one of them: the fifteenth and the second Tuesday are different dates in every
-- month, so a rule carrying both would say nothing about which was meant. month_week runs
-- 1 to 5, or -1 for the last one, which is what a calendar program means by the last Friday
-- of the month.
--
-- days_of_week becomes nullable for the same reason: a monthly rule on a date has no
-- weekday, and one on a weekday of the month has exactly one. For a set of picked dates it
-- holds the days those dates happen to fall on, which is what the sentence describing the
-- series reads off.
ALTER TABLE `Event_Series` MODIFY COLUMN `interval_weeks` int NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `Event_Series` MODIFY COLUMN `days_of_week` varchar(27) NULL;
--> statement-breakpoint
ALTER TABLE `Event_Series` ADD COLUMN `interval_months` int NULL AFTER `interval_weeks`;
--> statement-breakpoint
ALTER TABLE `Event_Series` ADD COLUMN `month_day` tinyint NULL AFTER `interval_months`;
--> statement-breakpoint
ALTER TABLE `Event_Series` ADD COLUMN `month_week` tinyint NULL AFTER `month_day`;
--> statement-breakpoint
ALTER TABLE `Event_Series` ADD CONSTRAINT `chk_series_interval_months` CHECK((`interval_months` >= 1));
--> statement-breakpoint
ALTER TABLE `Event_Series` ADD CONSTRAINT `chk_series_frequency` CHECK((`frequency` in (_latin1'weekly',_latin1'monthly',_latin1'dates')));
