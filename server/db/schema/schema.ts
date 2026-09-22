import { mysqlTable, index, foreignKey, primaryKey, unique, int, bigint, varchar, char, varbinary, time, date, check, text, datetime, mysqlEnum, json, tinyint, customType } from "drizzle-orm/mysql-core"
import { sql } from "drizzle-orm"

/**
 * MySQL SET columns have no built in Drizzle type. drizzle-kit pull could not
 * parse this one and left it out of the generated declarations, which would
 * make a later generate emit a DROP for a column that production relies on.
 * Declaring it here keeps the declarations complete and keeps the emitted DDL
 * identical to what the database already has.
 */
const reservationSource = customType<{ data: 'tableau' | 'astra'; driverData: string }>({
	dataType() {
		return "set('tableau','astra')";
	},
});

/**
 * What VIA refused to serve, and why, aggregated by the minute. Written by
 * server/services/denialRecorder.js once a minute rather than once a refusal,
 * because a row per refusal would load the database hardest exactly when the
 * database is the thing under pressure. No address is stored in any column.
 */
export const accessDenials = mysqlTable("Access_Denials", {
	bucketStart: datetime("bucket_start", { mode: 'string' }).notNull(),
	reason: varchar({ length: 32 }).notNull(),
	route: varchar({ length: 100 }).notNull(),
	authenticated: tinyint().default(0).notNull(),
	denialCount: int("denial_count").default(0).notNull(),
	clientCount: int("client_count").default(0).notNull(),
},
(table) => [
	index("idx_access_denials_bucket").on(table.bucketStart),
	primaryKey({ columns: [table.bucketStart, table.reason, table.route, table.authenticated], name: "Access_Denials_pk"}),
]);

/**
 * Bug reports, from the form in About.
 *
 * Somebody who has found something wrong with VIA has had one way to say so,
 * which is to write to the address on the About page, and most people do not
 * write an email about a button. The form records what they saw and where they
 * saw it, and an admin reads it on the admin page.
 *
 * reportedBy is the NetID of somebody signed in, and nothing at all for a
 * visitor who is not, because a student should not have to sign in to say that
 * a page is broken. contact is what they chose to give so they can be written
 * back to, which is optional for the same reason. No address of any kind is
 * recorded: the platform does not store those, and a bug report is no reason to
 * start.
 */
/**
 * How many times an event's page was read, by event and by day. Written by
 * server/services/viewRecorder.js once a minute rather than once a reading,
 * for the same reason Access_Denials is: the hot path should not carry a
 * write. Nothing about the reader is stored in any column, so the number
 * counts readings rather than readers.
 */
export const eventViews = mysqlTable("Event_Views", {
	eventId: int("event_id").notNull().references(() => events.eventId, { onDelete: "cascade" } ),
	day: date({ mode: 'string' }).notNull(),
	viewCount: int("view_count").default(0).notNull(),
},
(table) => [
	index("idx_event_views_day").on(table.day),
	primaryKey({ columns: [table.eventId, table.day], name: "Event_Views_pk"}),
]);

export const bugReports = mysqlTable("Bug_Reports", {
	reportId: int("report_id").autoincrement().notNull(),
	reportedBy: varchar("reported_by", { length: 20 }).references(() => users.netId, { onDelete: "set null" } ),
	area: varchar({ length: 50 }).notNull(),
	summary: varchar({ length: 200 }).notNull(),
	detail: text(),
	contact: varchar({ length: 255 }),
	page: varchar({ length: 500 }),
	status: varchar({ length: 20 }).default('Open').notNull(),
	createdAt: datetime("created_at", { mode: 'string'}).default(sql`(CURRENT_TIMESTAMP)`).notNull(),
},
(table) => [
	index("idx_bug_reports_status").on(table.status, table.createdAt),
	primaryKey({ columns: [table.reportId], name: "Bug_Reports_report_id"}),
	check("chk_bug_report_status", sql`(\`status\` in (_latin1\'Open\',_latin1\'Closed\'))`),
]);

export const courseSections = mysqlTable("Course_Sections", {
	sectionId: int("section_id").autoincrement().notNull(),
	courseCode: varchar("course_code", { length: 20 }).notNull().references(() => courses.courseCode, { onDelete: "cascade" } ),
	locationId: int("location_id").notNull().references(() => locations.locationId, { onDelete: "cascade" } ),
	dayOfWeek: varchar("day_of_week", { length: 20 }).notNull(),
	startTime: time("start_time").notNull(),
	endTime: time("end_time").notNull(),
	semester: varchar({ length: 20 }).notNull(),
	sectionType: varchar("section_type", { length: 50 }),
},
(table) => [
	index("location_id").on(table.locationId),
	primaryKey({ columns: [table.sectionId], name: "Course_Sections_section_id"}),
	unique("uq_section").on(table.courseCode, table.locationId, table.dayOfWeek, table.startTime, table.endTime, table.semester),
]);

export const courses = mysqlTable("Courses", {
	courseCode: varchar("course_code", { length: 20 }).notNull(),
	title: varchar({ length: 200 }).notNull(),
},
(table) => [
	primaryKey({ columns: [table.courseCode], name: "Courses_course_code"}),
]);

/**
 * The rule behind a repeating event. Its occurrences are ordinary Events rows
 * carrying series_id, so everything that reads events keeps working without
 * knowing that recurrence exists.
 */
export const eventSeries = mysqlTable("Event_Series", {
	seriesId: int("series_id").autoincrement().notNull(),
	rsoId: int("rso_id").notNull().references(() => rsOs.rsoId, { onDelete: "cascade" } ),
	createdBy: varchar("created_by", { length: 20 }).notNull().references(() => users.netId, { onDelete: "cascade" } ),
	/**
	 * Which of the three shapes this rule is: weekly, monthly, or a set of dates
	 * the organizer picked.
	 */
	frequency: varchar({ length: 20 }).default('weekly').notNull(),
	/**
	 * The interval, in the unit its own shape counts in. A weekly rule has weeks
	 * and no months, a monthly rule the other way round, and a set of picked
	 * dates has neither, because there is no rule between one date and the next.
	 */
	intervalWeeks: int("interval_weeks"),
	intervalMonths: int("interval_months"),
	/**
	 * The two shapes a monthly rule can take, and only ever one of them: a date
	 * in the month, such as the fifteenth, or a position and a weekday, such as
	 * the second Tuesday. monthWeek is 1 to 5, or -1 for the last one.
	 */
	monthDay: tinyint("month_day"),
	monthWeek: tinyint("month_week"),
	/**
	 * The days a weekly rule runs on, the one weekday a monthly rule by position
	 * uses, and for a set of picked dates the days those dates happen to fall
	 * on, which is what the sentence describing the series reads off.
	 */
	daysOfWeek: varchar("days_of_week", { length: 27 }),
	startsOn: date("starts_on", { mode: 'string' }).notNull(),
	endsOn: date("ends_on", { mode: 'string' }).notNull(),
	startOfDay: time("start_of_day").notNull(),
	durationMinutes: int("duration_minutes").notNull(),
	externalUid: varchar("external_uid", { length: 255 }),
},
(table) => [
	index("created_by").on(table.createdBy),
	primaryKey({ columns: [table.seriesId], name: "Event_Series_series_id"}),
	unique("uq_series_external_uid").on(table.rsoId, table.externalUid),
	check("chk_series_dates", sql`(\`ends_on\` >= \`starts_on\`)`),
	check("chk_series_interval", sql`(\`interval_weeks\` >= 1)`),
	check("chk_series_interval_months", sql`(\`interval_months\` >= 1)`),
	check("chk_series_frequency", sql`(\`frequency\` in (_latin1\'weekly\',_latin1\'monthly\',_latin1\'dates\'))`),
]);

export const eventTags = mysqlTable("Event_Tags", {
	eventId: int("event_id").notNull().references(() => events.eventId, { onDelete: "cascade" } ),
	tagName: varchar("tag_name", { length: 50 }).notNull().references(() => tags.tagName, { onDelete: "cascade" } ),
},
(table) => [
	index("tag_name").on(table.tagName),
	primaryKey({ columns: [table.eventId, table.tagName], name: "Event_Tags_event_id_tag_name"}),
]);

export const events = mysqlTable("Events", {
	eventId: int("event_id").autoincrement().notNull(),
	rsoId: int("rso_id").notNull().references(() => rsOs.rsoId, { onDelete: "cascade" } ),
	createdBy: varchar("created_by", { length: 20 }).notNull().references(() => users.netId, { onDelete: "cascade" } ),
	locationId: int("location_id").references(() => locations.locationId, { onDelete: "cascade" } ),
	locationText: varchar("location_text", { length: 200 }),
	externalUid: varchar("external_uid", { length: 255 }),
	title: varchar({ length: 200 }).notNull(),
	description: text(),
	startTime: datetime("start_time", { mode: 'string'}).notNull(),
	endTime: datetime("end_time", { mode: 'string'}).notNull(),
	isPrivate: tinyint("is_private").default(0).notNull(),
	seriesId: int("series_id").references(() => eventSeries.seriesId, { onDelete: "cascade" } ),
	// An occurrence edited on its own. A later edit to the whole series skips it.
	detached: tinyint().default(0).notNull(),
	// Set when the event is called off. The row stays, so the people who planned
	// to go can be told, and the feed shows it marked in the archive.
	cancelledAt: datetime("cancelled_at", { mode: 'string'}),
	// The small thing a board changes at the door, shown beside the room.
	locationNote: varchar("location_note", { length: 500 }),
	// When the row last changed, which is what the sitemap publishes as lastmod.
	// It used to publish the hour the event starts at, so a sitemap full of
	// events that have not happened yet claimed to have been modified in the
	// future, and Google ignores a lastmod it cannot believe.
	//
	// The column also carries ON UPDATE CURRENT_TIMESTAMP in the database.
	// Drizzle's datetime cannot express that, only timestamp can, so the
	// migration owns it, as it does for Facility_Reservations.scraped_at.
	updatedAt: datetime("updated_at", { mode: 'string'})
		.default(sql`CURRENT_TIMESTAMP`).notNull(),
	/*
	 * When an organizer entered this event, which VIA never recorded before.
	 *
	 * Nullable and deliberately not backfilled. Every row older than migration 0021 has an
	 * unknown creation time, and writing the moment the migration ran into them would put a
	 * confident wrong answer where the honest answer is that nobody wrote it down. Null
	 * means unknown, so any question about how far in advance organizers plan has to say
	 * how much it does not know.
	 */
	createdAt: datetime("created_at", { mode: 'string'}).default(sql`CURRENT_TIMESTAMP`),
},
(table) => [
	index("rso_id").on(table.rsoId),
	index("created_by").on(table.createdBy),
	index("location_id").on(table.locationId),
	index("series_id").on(table.seriesId),
	// The feed reads public events by when they start, and orders them the same
	// way, so the filter and the sort come off one index.
	index("idx_events_public_start").on(table.isPrivate, table.startTime),
	primaryKey({ columns: [table.eventId], name: "Events_event_id"}),
	unique("uq_event_external_uid").on(table.rsoId, table.externalUid),
	check("chk_event_times", sql`(\`end_time\` > \`start_time\`)`),
]);

export const facilityReservations = mysqlTable("Facility_Reservations", {
	reservationId: int("reservation_id").autoincrement().notNull(),
	locationId: int("location_id").notNull().references(() => locations.locationId, { onDelete: "cascade" } ),
	customer: varchar({ length: 255 }).default('').notNull(),
	eventName: varchar("event_name", { length: 500 }).default('').notNull(),
	startTime: datetime("start_time", { mode: 'string'}).notNull(),
	endTime: datetime("end_time", { mode: 'string'}).notNull(),
	source: reservationSource('source').default('astra').notNull(),
	// The column also carries ON UPDATE CURRENT_TIMESTAMP in the database. Drizzle's
	// datetime cannot express that, only timestamp can, so the migration owns it.
	scrapedAt: datetime("scraped_at", { mode: 'string'}).default(sql`CURRENT_TIMESTAMP`).notNull(),
	/*
	 * What Ad Astra says about a booking beyond where and when it is.
	 *
	 * All nullable, because Tableau supplies none of them and because a field Ad Astra
	 * stops sending has to degrade into an empty column rather than into a failed poll.
	 * The activity identifier is the only stable identity a booking has, which is what
	 * lets a booking that moved be recognised as the same booking.
	 */
	activityId: varchar("activity_id", { length: 40 }),
	parentActivityId: varchar("parent_activity_id", { length: 40 }),
	// Ad Astra's own event identifier, which a booking that is an event rather than a class
	// carries. Named for its source so it is never mistaken for Events.event_id, which is
	// VIA's own and unrelated.
	astraEventId: varchar("astra_event_id", { length: 40 }),
	activityType: varchar("activity_type", { length: 32 }),
	sectionId: varchar("section_id", { length: 32 }),
	instructor: varchar({ length: 200 }),
	/*
	 * When each source first showed this booking. Two columns rather than a log of
	 * observations, because the only question anybody asks of it is how long one source
	 * took to agree with the other, and ten bytes answers that where a row every four
	 * hours for every booking on campus would cost gigabytes to answer the same thing.
	 */
	astraFirstSeen: datetime("astra_first_seen", { mode: 'string'}),
	tableauFirstSeen: datetime("tableau_first_seen", { mode: 'string'}),
},
(table) => [
	index("idx_facility_reservations_activity").on(table.activityId),
	primaryKey({ columns: [table.reservationId], name: "Facility_Reservations_reservation_id"}),
	unique("uq_reservation").on(table.locationId, table.startTime, table.endTime),
	check("chk_reservation_times", sql`(\`end_time\` > \`start_time\`)`),
]);

/**
 * The strings that facility reservation history points at instead of repeating.
 *
 * History grows without bound and its text repeats enormously: one course section meeting
 * three times a week for a term writes the same name and instructor forty eight times.
 * One dictionary row and a four byte identifier replaces about ninety bytes of repeated
 * text per row.
 *
 * Values are truncated to the column's length on the way in and on the way out, so two
 * longer values that agree that far resolve to one shortened name rather than one of them
 * silently ending up with no name. The migration says why that matters.
 */
export const facilityText = mysqlTable("Facility_Text", {
	textId: int("text_id").autoincrement().notNull(),
	value: varchar({ length: 191 }).notNull(),
},
(table) => [
	primaryKey({ columns: [table.textId], name: "Facility_Text_text_id"}),
	unique("uq_facility_text_value").on(table.value),
]);

/**
 * Every reservation that has already happened.
 *
 * Rows arrive here when they leave the working set, which is what used to be a delete.
 * Nothing on a request path reads this table: it exists for the questions VISION.md asks
 * about terms, rooms and sources, all of which are asked offline.
 *
 * There is deliberately no foreign key on the location. History has to outlive what it
 * refers to, and a cascade would destroy the record of what happened in a room because the
 * room was removed from a table.
 */
export const facilityReservationHistory = mysqlTable("Facility_Reservation_History", {
	// int rather than bigint: at the order of a million rows a year this lasts four thousand
	// years, and the four bytes saved are paid again in every index entry.
	historyId: int("history_id").autoincrement().notNull(),
	locationId: int("location_id").notNull(),
	startTime: datetime("start_time", { mode: 'string'}).notNull(),
	endTime: datetime("end_time", { mode: 'string'}).notNull(),
	activityId: varchar("activity_id", { length: 40 }),
	parentActivityId: varchar("parent_activity_id", { length: 40 }),
	astraEventId: varchar("astra_event_id", { length: 40 }),
	sectionId: varchar("section_id", { length: 32 }),
	eventNameId: int("event_name_id"),
	customerId: int("customer_id"),
	instructorId: int("instructor_id"),
	activityTypeId: int("activity_type_id"),
	source: reservationSource('source').default('astra').notNull(),
	astraFirstSeen: datetime("astra_first_seen", { mode: 'string'}),
	tableauFirstSeen: datetime("tableau_first_seen", { mode: 'string'}),
	archivedAt: datetime("archived_at", { mode: 'string'}).default(sql`CURRENT_TIMESTAMP`).notNull(),
},
(table) => [
	// Two indexes, not four. The migration has the accounting: the four that first suggested
	// themselves cost more than the data they indexed, and nothing on a request path reads
	// this table, so a question that has to scan is a few seconds in a job nobody waits on.
	index("idx_frh_start").on(table.startTime),
	index("idx_frh_activity").on(table.activityId),
	primaryKey({ columns: [table.historyId], name: "Facility_Reservation_History_history_id"}),
]);

export const localAccounts = mysqlTable("LocalAccounts", {
	netId: varchar("net_id", { length: 20 }).notNull().references(() => users.netId, { onDelete: "cascade" } ),
	passwordHash: varchar("password_hash", { length: 255 }).notNull(),
},
(table) => [
	primaryKey({ columns: [table.netId], name: "LocalAccounts_net_id"}),
]);

export const locations = mysqlTable("Locations", {
	locationId: int("location_id").autoincrement().notNull(),
	building: varchar({ length: 50 }).notNull(),
	roomNumber: varchar("room_number", { length: 20 }).notNull(),
	maxCapacity: int("max_capacity").notNull(),
	hasAvEquipment: tinyint("has_av_equipment").default(0).notNull(),
},
(table) => [
	primaryKey({ columns: [table.locationId], name: "Locations_location_id"}),
	unique("uq_room").on(table.building, table.roomNumber),
]);

export const midterms = mysqlTable("Midterms", {
	midtermId: int("midterm_id").autoincrement().notNull(),
	courseCode: varchar("course_code", { length: 20 }).notNull().references(() => courses.courseCode, { onDelete: "cascade" } ),
	submittedBy: varchar("submitted_by", { length: 20 }).references(() => users.netId, { onDelete: "cascade" } ),
	locationId: int("location_id").references(() => locations.locationId, { onDelete: "cascade" } ),
	locationText: varchar("location_text", { length: 200 }),
	externalUid: varchar("external_uid", { length: 255 }),
	title: varchar({ length: 200 }).notNull(),
	startTime: datetime("start_time", { mode: 'string'}).notNull(),
	endTime: datetime("end_time", { mode: 'string'}).notNull(),
	status: varchar({ length: 20 }).default('Pending').notNull(),
},
(table) => [
	index("course_code").on(table.courseCode),
	index("submitted_by").on(table.submittedBy),
	index("location_id").on(table.locationId),
	primaryKey({ columns: [table.midtermId], name: "Midterms_midterm_id"}),
	unique("uq_midterm_external_uid").on(table.externalUid),
	check("chk_midterm_status", sql`(\`status\` in (_latin1\'Pending\',_latin1\'Confirmed\',_latin1\'Cancelled\'))`),
	check("chk_midterm_times", sql`(\`end_time\` > \`start_time\`)`),
]);

export const pollLog = mysqlTable("Poll_Log", {
	logId: int("log_id").autoincrement().notNull(),
	service: mysqlEnum(['courses','facilities','astra']).notNull(),
	startedAt: datetime("started_at", { mode: 'string'}).notNull(),
	finishedAt: datetime("finished_at", { mode: 'string'}),
	rowsProcessed: int("rows_processed").default(0).notNull(),
	rowsSkipped: int("rows_skipped").default(0).notNull(),
	errorCount: int("error_count").default(0).notNull(),
	lastError: text("last_error"),
	metadata: json(),
},
(table) => [
	index("idx_poll_log_service").on(table.service),
	index("idx_poll_log_started").on(table.startedAt),
	primaryKey({ columns: [table.logId], name: "Poll_Log_log_id"}),
]);

export const rsoMemberships = mysqlTable("RSO_Memberships", {
	netId: varchar("net_id", { length: 20 }).notNull().references(() => users.netId, { onDelete: "cascade" } ),
	rsoId: int("rso_id").notNull().references(() => rsOs.rsoId, { onDelete: "cascade" } ),
	role: varchar({ length: 20 }).default('Member').notNull(),
	joinedAt: datetime("joined_at", { mode: 'string'}).default(sql`(CURRENT_TIMESTAMP)`).notNull(),
},
(table) => [
	index("rso_id").on(table.rsoId),
	primaryKey({ columns: [table.netId, table.rsoId], name: "RSO_Memberships_net_id_rso_id"}),
	check("chk_membership_role", sql`(\`role\` in (_latin1\'Member\',_latin1\'Board\',_latin1\'Admin\'))`),
]);

export const rsOs = mysqlTable("RSOs", {
	rsoId: int("rso_id").autoincrement().notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	logoColor: varchar("logo_color", { length: 7 }).default('#000000').notNull(),
	foundedYear: int("founded_year"),
},
(table) => [
	primaryKey({ columns: [table.rsoId], name: "RSOs_rso_id"}),
]);

export const rsvPs = mysqlTable("RSVPs", {
	netId: varchar("net_id", { length: 20 }).notNull().references(() => users.netId, { onDelete: "cascade" } ),
	eventId: int("event_id").notNull().references(() => events.eventId, { onDelete: "cascade" } ),
	status: varchar({ length: 20 }).default('Going').notNull(),
},
(table) => [
	index("event_id").on(table.eventId),
	primaryKey({ columns: [table.netId, table.eventId], name: "RSVPs_net_id_event_id"}),
	check("chk_rsvp_status", sql`(\`status\` in (_latin1\'Going\',_latin1\'Maybe\',_latin1\'Not Going\'))`),
]);

export const tags = mysqlTable("Tags", {
	tagName: varchar("tag_name", { length: 50 }).notNull(),
},
(table) => [
	primaryKey({ columns: [table.tagName], name: "Tags_tag_name"}),
]);

export const unknownBuildingCodes = mysqlTable("Unknown_Building_Codes", {
	codeId: int("code_id").autoincrement().notNull(),
	logId: int("log_id").notNull().references(() => pollLog.logId, { onDelete: "cascade" } ),
	rawCode: varchar("raw_code", { length: 50 }).notNull(),
	seenAt: datetime("seen_at", { mode: 'string'}).default(sql`(CURRENT_TIMESTAMP)`).notNull(),
},
(table) => [
	index("idx_ubc_log_id").on(table.logId),
	index("idx_ubc_raw_code").on(table.rawCode),
	primaryKey({ columns: [table.codeId], name: "Unknown_Building_Codes_code_id"}),
]);

export const users = mysqlTable("Users", {
	netId: varchar("net_id", { length: 20 }).notNull(),
	fullName: varchar("full_name", { length: 100 }),
	email: varchar({ length: 100 }),
	isGlobalAdmin: tinyint("is_global_admin").default(0).notNull(),
	invitedAt: datetime("invited_at", { mode: 'string'}),
},
(table) => [
	primaryKey({ columns: [table.netId], name: "Users_net_id"}),
	unique("uq_email").on(table.email),
]);

/**
 * A Discord account standing for a NetID. The bot reports the Discord identifier
 * it observed and this table is how the web platform decides who that is, so
 * authorization for anything done through the bot is decided here. Both
 * columns are unique, and the identifier is a string because a Discord
 * snowflake does not fit a JavaScript number exactly.
 */
export const discordLinks = mysqlTable("Discord_Links", {
	discordUserId: varchar("discord_user_id", { length: 32 }).notNull(),
	netId: varchar("net_id", { length: 20 }).notNull().references(() => users.netId, { onDelete: "cascade" } ),
	linkedAt: datetime("linked_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	// The Discord refresh token from the link flow, encrypted, held only while
	// the person accepted the linked roles step.
	discordAuthorization: varbinary("discord_authorization", { length: 1024 }),
},
(table) => [
	primaryKey({ columns: [table.discordUserId], name: "Discord_Links_discord_user_id"}),
	unique("uq_discord_links_net_id").on(table.netId),
]);

/**
 * Which Discord server an organization's board has bound the bot to.
 *
 * A mirror rather than the record. The binding is a fact about a Discord
 * server, the bot is what is installed there, and Guild_Installations in
 * via_bot holds it. The bot reports each binding here through the internal
 * service API so that the board's own dashboard can say whether the bot is set
 * up, because the website has no account on the bot's database and is not
 * meant to have one.
 *
 * Nothing is authorized from this table. Unlinking is authorized by the same
 * requireRSOAdmin the rest of the dashboard uses, and the bot is what applies
 * it. Being a few seconds behind is therefore a cosmetic problem rather than a
 * correctness one.
 *
 * reported_at also carries ON UPDATE CURRENT_TIMESTAMP in the database, which
 * Drizzle's datetime cannot express, so the migration owns that clause as it
 * does for Events.updated_at.
 */
export const rsoDiscordGuilds = mysqlTable("Rso_Discord_Guilds", {
	guildId: varchar("guild_id", { length: 32 }).notNull(),
	rsoId: int("rso_id").notNull().references(() => rsOs.rsoId, { onDelete: "cascade" } ),
	// What the server calls itself, so the dashboard names it rather than
	// showing the identifier.
	guildName: varchar("guild_name", { length: 200 }).default('').notNull(),
	// The Discord account that bound the server, which the web platform
	// confirmed was on the board at the time.
	boundBy: varchar("bound_by", { length: 32 }),
	boundAt: datetime("bound_at", { mode: 'string'}),
	reportedAt: datetime("reported_at", { mode: 'string'}).default(sql`CURRENT_TIMESTAMP`).notNull(),
},
(table) => [
	index("idx_rso_discord_guilds_rso").on(table.rsoId),
	primaryKey({ columns: [table.guildId], name: "Rso_Discord_Guilds_guild_id"}),
]);

/**
 * The organizations a linked person follows, as the bot reported them.
 *
 * A mirror rather than the record. Subscriptions in via_bot is what the bot
 * reads when it decides who to write to, because the bot is what sends the
 * messages. This exists so the website can offer the same choice from an
 * organization's own page, and show what the person already chose.
 *
 * Keyed by the Discord account, because that is what the bot holds and what it
 * reports. Unlinking takes these with it, which is the point of the foreign
 * key: somebody who unlinks should leave no record of what they followed.
 */
export const discordRsoFollows = mysqlTable("Discord_Rso_Follows", {
	discordUserId: varchar("discord_user_id", { length: 32 }).notNull()
		.references(() => discordLinks.discordUserId, { onDelete: "cascade" } ),
	rsoId: int("rso_id").notNull().references(() => rsOs.rsoId, { onDelete: "cascade" } ),
	followedAt: datetime("followed_at", { mode: 'string'}).default(sql`CURRENT_TIMESTAMP`).notNull(),
},
(table) => [
	primaryKey({ columns: [table.discordUserId, table.rsoId], name: "Discord_Rso_Follows_pk"}),
]);

/**
 * The events a linked person asked to be reminded about, as the bot reported
 * them. A mirror of Reminders in via_bot, for the same reason and on the same
 * terms as the follows above.
 */
export const discordEventReminders = mysqlTable("Discord_Event_Reminders", {
	discordUserId: varchar("discord_user_id", { length: 32 }).notNull()
		.references(() => discordLinks.discordUserId, { onDelete: "cascade" } ),
	eventId: int("event_id").notNull().references(() => events.eventId, { onDelete: "cascade" } ),
	askedAt: datetime("asked_at", { mode: 'string'}).default(sql`CURRENT_TIMESTAMP`).notNull(),
},
(table) => [
	index("idx_discord_event_reminders_event").on(table.eventId),
	primaryKey({ columns: [table.discordUserId, table.eventId], name: "Discord_Event_Reminders_pk"}),
]);

/**
 * The short lived handshake before a link exists. Opened by the bot for the
 * Discord account that asked, completed on the website, and checked against
 * the Discord account the callback actually receives.
 */
export const linkSessions = mysqlTable("Link_Sessions", {
	sessionId: char("session_id", { length: 43 }).notNull(),
	discordUserId: varchar("discord_user_id", { length: 32 }).notNull(),
	createdAt: datetime("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	expiresAt: datetime("expires_at", { mode: 'string' }).notNull(),
	completedAt: datetime("completed_at", { mode: 'string' }),
},
(table) => [
	primaryKey({ columns: [table.sessionId], name: "Link_Sessions_session_id"}),
]);

/**
 * What changed, in order, for the Discord bot to act on. The identifier is the
 * reader's cursor and only grows. The web platform records nothing about what
 * any reader has read.
 */
export const outbox = mysqlTable("Outbox", {
	outboxId: bigint("outbox_id", { mode: 'number' }).autoincrement().notNull(),
	kind: varchar({ length: 40 }).notNull(),
	subjectType: varchar("subject_type", { length: 20 }).notNull(),
	subjectId: varchar("subject_id", { length: 40 }).notNull(),
	// Copied out of the payload so a reader can route without a second query.
	rsoId: int("rso_id"),
	payload: json().notNull(),
	createdAt: datetime("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
},
(table) => [
	primaryKey({ columns: [table.outboxId], name: "Outbox_outbox_id"}),
	index("idx_outbox_created").on(table.createdAt),
]);

/**
 * Who means to go. Replaces the count the removed RSVPs used to give. A subject
 * is a NetID for a linked person and "h:" plus a salted hash of a Discord
 * identifier for anyone else, and the primary key counts each once.
 */
export const eventInterest = mysqlTable("Event_Interest", {
	eventId: int("event_id").notNull().references(() => events.eventId, { onDelete: "cascade" } ),
	subject: varchar({ length: 64 }).notNull(),
	source: varchar({ length: 20 }).notNull(),
	createdAt: datetime("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
},
(table) => [
	primaryKey({ columns: [table.eventId, table.subject], name: "Event_Interest_event_id_subject"}),
]);

/**
 * One rating per person per event, between one and five, with an optional
 * comment. The board sees the aggregate and the comments, never the raters.
 */
export const eventFeedback = mysqlTable("Event_Feedback", {
	eventId: int("event_id").notNull().references(() => events.eventId, { onDelete: "cascade" } ),
	netId: varchar("net_id", { length: 20 }).notNull().references(() => users.netId, { onDelete: "cascade" } ),
	rating: tinyint().notNull(),
	comment: text(),
	createdAt: datetime("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
},
(table) => [
	primaryKey({ columns: [table.eventId, table.netId], name: "Event_Feedback_event_id_net_id"}),
	check("chk_feedback_rating", sql`(\`rating\` between 1 and 5)`),
]);

/**
 * A calendar subscription address per person, guarded by a token stored only
 * as its hash, carrying the RSOs the person follows. Null means every RSO.
 */
export const personalCalendars = mysqlTable("Personal_Calendars", {
	netId: varchar("net_id", { length: 20 }).notNull().references(() => users.netId, { onDelete: "cascade" } ),
	tokenHash: char("token_hash", { length: 64 }).notNull(),
	rsoIds: json("rso_ids"),
	rotatedAt: datetime("rotated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
},
(table) => [
	primaryKey({ columns: [table.netId], name: "Personal_Calendars_net_id"}),
	unique("uq_personal_calendars_token_hash").on(table.tokenHash),
]);
