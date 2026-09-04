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
	frequency: varchar({ length: 20 }).default('weekly').notNull(),
	intervalWeeks: int("interval_weeks").default(1).notNull(),
	daysOfWeek: varchar("days_of_week", { length: 27 }).notNull(),
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
},
(table) => [
	primaryKey({ columns: [table.reservationId], name: "Facility_Reservations_reservation_id"}),
	unique("uq_reservation").on(table.locationId, table.startTime, table.endTime),
	check("chk_reservation_times", sql`(\`end_time\` > \`start_time\`)`),
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
