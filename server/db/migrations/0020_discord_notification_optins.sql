-- What a linked person asked to be told about, as the bot reported it.
--
-- Both of these live in the bot's database: Subscriptions and Reminders in via_bot are the
-- record of what a person follows and what they asked to be reminded about, because the
-- bot is what sends the messages. The website has no account on that database and is not
-- meant to have one, so these are mirrors, reported by the bot through the internal
-- service API, exactly as Rso_Discord_Guilds is.
--
-- They exist so that the website can offer the same two choices the bot offers. A person
-- who is signed in and has linked their Discord account should be able to follow an
-- organization from that organization's page, and ask for a reminder from an event's page,
-- without being told to go and type a command somewhere else. What they choose is written
-- to the outbox for the bot to apply, and the mirror is written at the same time so the
-- page answers immediately rather than after the bot next reads its instructions.
--
-- Keyed by the Discord account rather than by the NetID, because that is what the bot
-- holds and what it reports. Unlinking deletes the link row, and these go with it, which
-- is what the foreign key is for: a person who unlinks should not leave a record of what
-- they followed behind them.
CREATE TABLE `Discord_Rso_Follows` (
  `discord_user_id` varchar(32) NOT NULL,
  `rso_id` int NOT NULL,
  `followed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `Discord_Rso_Follows_pk` PRIMARY KEY (`discord_user_id`, `rso_id`),
  CONSTRAINT `Discord_Rso_Follows_link_fk` FOREIGN KEY (`discord_user_id`)
    REFERENCES `Discord_Links` (`discord_user_id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `Discord_Rso_Follows_rso_fk` FOREIGN KEY (`rso_id`)
    REFERENCES `RSOs` (`rso_id`) ON DELETE CASCADE ON UPDATE NO ACTION
);
--> statement-breakpoint
CREATE TABLE `Discord_Event_Reminders` (
  `discord_user_id` varchar(32) NOT NULL,
  `event_id` int NOT NULL,
  `asked_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `Discord_Event_Reminders_pk` PRIMARY KEY (`discord_user_id`, `event_id`),
  CONSTRAINT `Discord_Event_Reminders_link_fk` FOREIGN KEY (`discord_user_id`)
    REFERENCES `Discord_Links` (`discord_user_id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `Discord_Event_Reminders_event_fk` FOREIGN KEY (`event_id`)
    REFERENCES `Events` (`event_id`) ON DELETE CASCADE ON UPDATE NO ACTION
);
--> statement-breakpoint
CREATE INDEX `idx_discord_event_reminders_event` ON `Discord_Event_Reminders` (`event_id`);
