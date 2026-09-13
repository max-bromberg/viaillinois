-- Somewhere to report a bug.
--
-- Somebody who finds something wrong with VIA has had one way to say so, which is to write
-- to the address on the About page, and most people do not write an email about a button.
-- The About page carries a form now, and this is where what they write lands.
--
-- reported_by is the NetID of somebody who was signed in, and nothing at all for a visitor
-- who was not, because a student should not have to sign in to say that a page is broken.
-- It is set to null rather than cascaded when an account goes, so that the report itself
-- survives the reporter leaving the university. contact is the address they chose to give
-- so that somebody can write back, which is optional for the same reason.
--
-- No address of any kind is recorded. The platform does not store those anywhere, the
-- denial counters included, and a bug report is no reason to start.
--
-- page is where they were when they hit it, which is the single most useful thing on the
-- form and the thing a reporter is least likely to remember to say.
CREATE TABLE `Bug_Reports` (
	`report_id` int AUTO_INCREMENT NOT NULL,
	`reported_by` varchar(20),
	`area` varchar(50) NOT NULL,
	`summary` varchar(200) NOT NULL,
	`detail` text,
	`contact` varchar(255),
	`page` varchar(500),
	`status` varchar(20) NOT NULL DEFAULT 'Open',
	`created_at` datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	CONSTRAINT `Bug_Reports_report_id` PRIMARY KEY(`report_id`),
	CONSTRAINT `chk_bug_report_status` CHECK((`status` in (_latin1'Open',_latin1'Closed')))
);
--> statement-breakpoint
ALTER TABLE `Bug_Reports` ADD CONSTRAINT `Bug_Reports_ibfk_1` FOREIGN KEY (`reported_by`) REFERENCES `Users`(`net_id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- The admin listing reads the open ones first and then by when they arrived.
CREATE INDEX `idx_bug_reports_status` ON `Bug_Reports` (`status`,`created_at`);
