-- Midterm dates come from HKN rather than from students voting on them.
--
-- The trigger goes first, because it reads Midterm_Votes and dropping the table under it
-- would leave a trigger that fails on every insert. Dropping the table then removes the
-- votes themselves, which is the point: they are a crowdsourced signal for a question that
-- now has an authoritative answer, and keeping them would invite someone to resurrect the
-- scoring later.
--
-- submitted_by becomes nullable because a midterm that came from HKN was submitted by
-- nobody. It stays a foreign key, so a midterm that a person did submit still points at a
-- real account.
DROP TRIGGER IF EXISTS trg_auto_confirm_midterm;
--> statement-breakpoint
DROP TABLE IF EXISTS Midterm_Votes;
--> statement-breakpoint
ALTER TABLE Midterms MODIFY COLUMN submitted_by VARCHAR(20) NULL;
