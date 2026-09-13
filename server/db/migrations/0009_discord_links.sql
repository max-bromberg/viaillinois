-- A Discord account can stand for a NetID.
--
-- The Discord bot acts for people, and everything it is allowed to do for a person rests
-- on knowing which NetID that person is. The bot never asserts a NetID. It reports the
-- Discord user identifier it observed in an interaction, and this table is how the web
-- platform turns that into an account, applying the same membership rules the dashboard
-- applies. The table lives here rather than in the bot's database for that reason: the
-- side that decides authorization is the side that holds the link.
--
-- Both columns are unique. A NetID with two Discord accounts, or a Discord account with two
-- NetIDs, would make "who is this" ambiguous, and the link flow replaces rather than adds.
-- discord_user_id is a string because a Discord identifier is a 64 bit integer that a
-- JavaScript number cannot hold exactly. A column that rounded it would link the wrong
-- account without anything failing.
--
-- discord_authorization holds the Discord refresh token from the link flow, encrypted with
-- a key the server reads from its environment, and only while the person has accepted the
-- optional linked roles step. It exists so that the facts published to Discord's linked
-- roles can be refreshed when a membership changes, and it is dropped when the link is.
--
-- A link session is the short lived handshake before a link exists: the bot opens one for
-- the Discord account that asked, the person completes it on the website, and the callback
-- checks that the Discord account it received is the one the session was opened for.
CREATE TABLE `Discord_Links` (
	`discord_user_id` varchar(32) NOT NULL,
	`net_id` varchar(20) NOT NULL,
	`linked_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`discord_authorization` varbinary(1024),
	CONSTRAINT `Discord_Links_discord_user_id` PRIMARY KEY(`discord_user_id`),
	CONSTRAINT `uq_discord_links_net_id` UNIQUE(`net_id`)
);
--> statement-breakpoint
ALTER TABLE `Discord_Links` ADD CONSTRAINT `Discord_Links_ibfk_1` FOREIGN KEY (`net_id`) REFERENCES `Users`(`net_id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE `Link_Sessions` (
	`session_id` char(43) NOT NULL,
	`discord_user_id` varchar(32) NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`expires_at` datetime NOT NULL,
	`completed_at` datetime,
	CONSTRAINT `Link_Sessions_session_id` PRIMARY KEY(`session_id`)
);
