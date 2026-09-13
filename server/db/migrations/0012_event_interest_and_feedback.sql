-- Who means to go, and what they thought afterwards.
--
-- RSVPs were removed in 0.5.0, and with them the only count of how many people meant to
-- attend. Interest brings the count back from a place people already press a button:
-- Discord's own "Interested" control on a scheduled event, and the bot's button on an
-- event card. A subject is a NetID when the person has linked their Discord account, and
-- otherwise "h:" followed by a salted hash of their Discord identifier, so an unlinked
-- person is counted once and identified by nobody. The primary key is what makes "once"
-- true. source records which control the interest came from, so a later web control joins
-- the same table without a migration.
--
-- Feedback is one rating per person per event, between one and five, with an optional
-- comment. It is tied to a real account so the board can trust the average, and the board
-- sees the average, the count and the comments, never who gave which rating.
CREATE TABLE `Event_Interest` (
	`event_id` int NOT NULL,
	`subject` varchar(64) NOT NULL,
	`source` varchar(20) NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `Event_Interest_event_id_subject` PRIMARY KEY(`event_id`,`subject`)
);
--> statement-breakpoint
ALTER TABLE `Event_Interest` ADD CONSTRAINT `Event_Interest_ibfk_1` FOREIGN KEY (`event_id`) REFERENCES `Events`(`event_id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE `Event_Feedback` (
	`event_id` int NOT NULL,
	`net_id` varchar(20) NOT NULL,
	`rating` tinyint NOT NULL,
	`comment` text,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `Event_Feedback_event_id_net_id` PRIMARY KEY(`event_id`,`net_id`),
	CONSTRAINT `chk_feedback_rating` CHECK((`rating` between 1 and 5))
);
--> statement-breakpoint
ALTER TABLE `Event_Feedback` ADD CONSTRAINT `Event_Feedback_ibfk_1` FOREIGN KEY (`event_id`) REFERENCES `Events`(`event_id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `Event_Feedback` ADD CONSTRAINT `Event_Feedback_ibfk_2` FOREIGN KEY (`net_id`) REFERENCES `Users`(`net_id`) ON DELETE cascade ON UPDATE no action;
