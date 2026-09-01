-- An RSO board can add people to its roster before those people have ever signed in.
--
-- A membership is a foreign key to Users, so an invited person still needs a row there.
-- What changes is that the row can stand for someone VIA has not met: no name, because
-- inventing one would put made up data in front of the board, and no email, because
-- guessing netid@illinois.edu would be wrong for anyone whose address differs and would
-- then collide with their real address on first sign in.
--
-- The unique index on email is unaffected. MySQL permits any number of nulls in one.
--
-- invited_at records that the row came from an invitation rather than a sign in, and is
-- cleared when the person actually arrives.
ALTER TABLE Users MODIFY COLUMN full_name VARCHAR(100) NULL;
--> statement-breakpoint
ALTER TABLE Users MODIFY COLUMN email VARCHAR(100) NULL;
--> statement-breakpoint
ALTER TABLE Users ADD COLUMN invited_at DATETIME NULL;
