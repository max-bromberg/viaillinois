-- The tag list becomes a list.
--
-- The eight tags a board could put on an event were written into the event form and into
-- the events feed's filter panel, in two copies of the same array, so adding one meant a
-- release. The Tags table has held them all along, but only as a side effect of saving an
-- event: setEventTags inserts whatever it is given and ignores what is already there, so
-- the table was a record of what had been used rather than a list of what may be used.
--
-- Making the pages read the table is what turns it into the list, and a tag nobody has
-- used yet would not be in it, so the eight are written here. INSERT IGNORE because most
-- of them are already there on any database that has events on it.
--
-- Nothing about the schema changes. This migration exists because the migrations are the
-- schema of record and this is a fact about the schema's contents that the application now
-- depends on.
INSERT IGNORE INTO Tags (tag_name) VALUES
  ('Free Food'),
  ('Workshop'),
  ('Social'),
  ('Corporate'),
  ('Competition'),
  ('Weekly Meeting'),
  ('Speaker'),
  ('Networking');
