-- A calendar subscription that follows a person's RSOs.
--
-- A phone's calendar application fetches an address on a schedule, and the address has to
-- be public, because the application cannot sign in. What guards it is a token in the
-- address, and the token is stored here only as its hash, so a copy of this table gives
-- nobody a working address. The person can rotate the token from the bot, which is why
-- the row records when that last happened.
--
-- rso_ids is the set the calendar carries, and null means every RSO. The bot writes the set
-- whenever the person's follows change, so the calendar and the personal feed agree.
CREATE TABLE `Personal_Calendars` (
	`net_id` varchar(20) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`rso_ids` json,
	`rotated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `Personal_Calendars_net_id` PRIMARY KEY(`net_id`),
	CONSTRAINT `uq_personal_calendars_token_hash` UNIQUE(`token_hash`)
);
--> statement-breakpoint
ALTER TABLE `Personal_Calendars` ADD CONSTRAINT `Personal_Calendars_ibfk_1` FOREIGN KEY (`net_id`) REFERENCES `Users`(`net_id`) ON DELETE cascade ON UPDATE no action;
