-- What VIA refused to serve, and why.
--
-- Counted in memory and flushed once a minute as aggregates, rather than one
-- row per refusal. A row per refusal would put the heaviest write load on the
-- database at precisely the moment the database is the resource under
-- pressure, which is the failure this table exists to make visible.
--
-- No address is stored, in any form. The question this answers is whether
-- readers are being turned away and how often, and a count per reason per
-- route answers it completely without VIA keeping a record of who read what.
-- client_count separates one client refused a thousand times, which is a
-- scraper, from a thousand clients refused once, which is a budget set too
-- tight.
--
-- route holds the matched route pattern rather than the raw path, so query
-- strings never land here and the cardinality stays flat.
CREATE TABLE `Access_Denials` (
  `bucket_start`   DATETIME     NOT NULL,
  `reason`         VARCHAR(32)  NOT NULL,
  `route`          VARCHAR(100) NOT NULL,
  `authenticated`  BOOLEAN      NOT NULL DEFAULT FALSE,
  `denial_count`   INT          NOT NULL DEFAULT 0,
  `client_count`   INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`bucket_start`,`reason`,`route`,`authenticated`),
  INDEX `idx_access_denials_bucket` (`bucket_start`)
);
