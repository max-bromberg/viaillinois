-- When an event row last changed.
--
-- The sitemap publishes a lastmod for every event, and what it published was the hour the
-- event starts at, which is not when the row changed and, for an event that has not
-- happened yet, is a date in the future. Google uses lastmod as a crawl signal only where
-- it is consistently accurate, and a sitemap full of entries claiming to have been modified
-- next Thursday is one whose lastmod is ignored wholesale. That matters here: Search
-- Console is sitting on dozens of event pages it has discovered and not crawled, and
-- lastmod is one of the few levers a small site has on that.
--
-- The column carries ON UPDATE CURRENT_TIMESTAMP, so every write the application already
-- makes keeps it true without a line of application code. Drizzle's datetime cannot
-- express that clause, only timestamp can, so the migration owns it, as it already does
-- for Facility_Reservations.scraped_at.
--
-- Rows that exist when this runs take the moment it ran, which is the best available
-- answer: nothing recorded when any of them last changed.
ALTER TABLE `Events`
  ADD COLUMN `updated_at` datetime NOT NULL
  DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
