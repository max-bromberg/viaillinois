-- Events and midterms can be imported from a calendar file, so imported rows remember the
-- identifier the calendar gave them. Importing the same file twice then updates what the
-- first import created instead of duplicating it.
--
-- For events the key is scoped to the RSO. Two RSOs can publish calendars that happen to
-- reuse an identifier, and neither should be able to block the other from importing. For
-- midterms there is one source, so the identifier stands alone.
--
-- Rows entered by hand carry no identifier. MySQL permits any number of nulls in a unique
-- index, which is exactly the behaviour wanted here.
ALTER TABLE Events ADD COLUMN external_uid VARCHAR(255) NULL;
--> statement-breakpoint
ALTER TABLE Events ADD CONSTRAINT uq_event_external_uid UNIQUE (rso_id, external_uid);
--> statement-breakpoint
ALTER TABLE Midterms ADD COLUMN external_uid VARCHAR(255) NULL;
--> statement-breakpoint
ALTER TABLE Midterms ADD CONSTRAINT uq_midterm_external_uid UNIQUE (external_uid);
--> statement-breakpoint
-- A midterm from HKN names its room as free text, which will often match no room record.
-- Same treatment as events: the room is optional and the text is kept either way.
ALTER TABLE Midterms MODIFY COLUMN location_id INT NULL;
--> statement-breakpoint
ALTER TABLE Midterms ADD COLUMN location_text VARCHAR(200) NULL AFTER location_id;
