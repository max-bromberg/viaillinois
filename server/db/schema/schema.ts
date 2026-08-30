import { mysqlTable, index, foreignKey, primaryKey, unique, int, varchar, time, check, text, datetime, mysqlEnum, json, tinyint, customType } from "drizzle-orm/mysql-core"
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
	locationId: int("location_id").notNull().references(() => locations.locationId, { onDelete: "cascade" } ),
	title: varchar({ length: 200 }).notNull(),
	description: text(),
	startTime: datetime("start_time", { mode: 'string'}).notNull(),
	endTime: datetime("end_time", { mode: 'string'}).notNull(),
	isPrivate: tinyint("is_private").default(0).notNull(),
},
(table) => [
	index("rso_id").on(table.rsoId),
	index("created_by").on(table.createdBy),
	index("location_id").on(table.locationId),
	primaryKey({ columns: [table.eventId], name: "Events_event_id"}),
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
	scrapedAt: datetime("scraped_at", { mode: 'string'}).default(sql`(CURRENT_TIMESTAMP)`).notNull(),
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

export const midtermVotes = mysqlTable("Midterm_Votes", {
	midtermId: int("midterm_id").notNull().references(() => midterms.midtermId, { onDelete: "cascade" } ),
	netId: varchar("net_id", { length: 20 }).notNull().references(() => users.netId, { onDelete: "cascade" } ),
	voteValue: int("vote_value").notNull(),
},
(table) => [
	index("net_id").on(table.netId),
	primaryKey({ columns: [table.midtermId, table.netId], name: "Midterm_Votes_midterm_id_net_id"}),
	check("chk_vote_value", sql`(\`vote_value\` in (-(1),1))`),
]);

export const midterms = mysqlTable("Midterms", {
	midtermId: int("midterm_id").autoincrement().notNull(),
	courseCode: varchar("course_code", { length: 20 }).notNull().references(() => courses.courseCode, { onDelete: "cascade" } ),
	submittedBy: varchar("submitted_by", { length: 20 }).notNull().references(() => users.netId, { onDelete: "cascade" } ),
	locationId: int("location_id").notNull().references(() => locations.locationId, { onDelete: "cascade" } ),
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
	fullName: varchar("full_name", { length: 100 }).notNull(),
	email: varchar({ length: 100 }).notNull(),
	isGlobalAdmin: tinyint("is_global_admin").default(0).notNull(),
},
(table) => [
	primaryKey({ columns: [table.netId], name: "Users_net_id"}),
	unique("uq_email").on(table.email),
]);
