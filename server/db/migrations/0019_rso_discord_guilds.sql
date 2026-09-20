-- Which Discord server, if any, an organization's board has bound the bot to.
--
-- The binding itself belongs to the bot. It is a fact about a Discord server, the bot is
-- what installed there, and Guild_Installations in via_bot is the record of it. This table
-- is a mirror of that record, reported by the bot through the internal service API, so
-- that the board's own dashboard can say whether the bot is set up without the website
-- reading a database it has no account for. The two databases are separated by
-- credentials, not only by convention, so a mirror is the only way the dashboard sees this
-- at all.
--
-- A mirror can be behind. What it is used for is telling a board that their server is
-- connected and offering them the way to disconnect it, and both of those survive being a
-- few seconds out of date. Nothing is authorized from this table: unlinking is authorized
-- by the same requireRSOAdmin the rest of the dashboard uses, and the bot applies it.
--
-- reported_at is when the bot last said this, which is what tells somebody reading the
-- table whether the mirror is being kept up. It carries ON UPDATE CURRENT_TIMESTAMP so
-- that a repeated report of an unchanged binding still moves it, which Drizzle's datetime
-- cannot express and the migration therefore owns, as it does for Events.updated_at.
--
-- The foreign key is on the organization rather than on the server, because the server is
-- Discord's and this database knows nothing about it. An organization that is deleted
-- takes its binding rows with it, and the bot hears about that as it hears about every
-- other change, through the outbox.
CREATE TABLE `Rso_Discord_Guilds` (
  `guild_id` varchar(32) NOT NULL,
  `rso_id` int NOT NULL,
  -- What the server calls itself, so the dashboard can name it rather than showing the
  -- identifier. Discord allows a hundred characters; the column is larger so that a name
  -- the bot reports is never truncated into something the board does not recognise.
  `guild_name` varchar(200) NOT NULL DEFAULT '',
  -- The Discord account that bound the server, which the web platform confirmed was on
  -- the board at the time. Kept so the dashboard can say who connected it.
  `bound_by` varchar(32) DEFAULT NULL,
  `bound_at` datetime DEFAULT NULL,
  `reported_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `Rso_Discord_Guilds_guild_id` PRIMARY KEY (`guild_id`),
  CONSTRAINT `Rso_Discord_Guilds_rso_id_fk` FOREIGN KEY (`rso_id`)
    REFERENCES `RSOs` (`rso_id`) ON DELETE CASCADE ON UPDATE NO ACTION
);
--> statement-breakpoint
CREATE INDEX `idx_rso_discord_guilds_rso` ON `Rso_Discord_Guilds` (`rso_id`);
