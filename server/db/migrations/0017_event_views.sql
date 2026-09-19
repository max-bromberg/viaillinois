-- How many times an event's page was read.
--
-- A board could see who was interested and what people thought afterwards, and
-- both of those arrive through the Discord bot, so a board whose members do not
-- use Discord read a column of zeros and learned nothing. A view is the one
-- signal the platform can collect on its own, from the reading somebody is
-- already doing.
--
-- Counted in memory and flushed once a minute as aggregates, the same way
-- Access_Denials is counted, so reading an event page never costs a write.
--
-- Nothing about the reader is stored, in any form: not an address, not a hash
-- of one, not a session. The row is an event, a day, and a number. That means
-- the number counts readings rather than readers, so one person refreshing five
-- times is five, and it is deliberately the crude measure rather than a
-- precise one bought with a record of who read what.
CREATE TABLE `Event_Views` (
  `event_id`   INT  NOT NULL,
  `day`        DATE NOT NULL,
  `view_count` INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (`event_id`,`day`),
  INDEX `idx_event_views_day` (`day`),
  CONSTRAINT `fk_event_views_event`
    FOREIGN KEY (`event_id`) REFERENCES `Events` (`event_id`) ON DELETE CASCADE
);
