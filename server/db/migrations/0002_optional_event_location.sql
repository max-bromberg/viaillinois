-- An event's location becomes optional, in two senses.
--
-- location_id becomes nullable, because some events happen somewhere VIA has no room
-- record for. Making it nullable rather than inventing a placeholder room keeps the
-- Locations table meaning what it says: rooms on campus, with a real capacity.
--
-- location_text carries whatever the organizer typed when it is not a room at all, such
-- as a video call link or a venue off campus. An imported calendar file supplies free
-- text for the same reason: its LOCATION line is written for humans and matches no room
-- record most of the time.
--
-- The two are not mutually exclusive in the schema, and deliberately so. Nothing is
-- gained by a constraint here, and an importer that matches a room while keeping the
-- original text is a reasonable thing to allow later.
ALTER TABLE Events MODIFY COLUMN location_id INT NULL;
--> statement-breakpoint
ALTER TABLE Events ADD COLUMN location_text VARCHAR(200) NULL AFTER location_id;
