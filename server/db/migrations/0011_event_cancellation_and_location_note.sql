-- An event can be cancelled without disappearing.
--
-- Until now an event was either present or deleted. A cancelled event that vanishes from
-- the feed cannot tell the students who planned to attend that it was cancelled rather than
-- mistyped, and a Discord announcement edited to say "cancelled" has nothing to point at.
-- cancelled_at records that the event was called off and when. The feed leaves cancelled
-- events out of what is upcoming and shows them, marked, in the archive. Deleting remains
-- what it was: the row is gone.
--
-- location_note is the small thing a board changes at the door: the north entrance, the
-- room next to the one booked, where to find the sign in sheet. It lives on the event so
-- that the website and the bot show the same note.
ALTER TABLE `Events` ADD COLUMN `cancelled_at` datetime;
--> statement-breakpoint
ALTER TABLE `Events` ADD COLUMN `location_note` varchar(500);
