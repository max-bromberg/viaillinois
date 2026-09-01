import { relations } from "drizzle-orm/relations";
import { courses, courseSections, locations, events, eventTags, tags, rsOs, users, facilityReservations, localAccounts, midterms, rsoMemberships, rsvPs, pollLog, unknownBuildingCodes } from "./schema.ts";

export const courseSectionsRelations = relations(courseSections, ({one}) => ({
	course: one(courses, {
		fields: [courseSections.courseCode],
		references: [courses.courseCode]
	}),
	location: one(locations, {
		fields: [courseSections.locationId],
		references: [locations.locationId]
	}),
}));

export const coursesRelations = relations(courses, ({many}) => ({
	courseSections: many(courseSections),
	midterms: many(midterms),
}));

export const locationsRelations = relations(locations, ({many}) => ({
	courseSections: many(courseSections),
	events: many(events),
	facilityReservations: many(facilityReservations),
	midterms: many(midterms),
}));

export const eventTagsRelations = relations(eventTags, ({one}) => ({
	event: one(events, {
		fields: [eventTags.eventId],
		references: [events.eventId]
	}),
	tag: one(tags, {
		fields: [eventTags.tagName],
		references: [tags.tagName]
	}),
}));

export const eventsRelations = relations(events, ({one, many}) => ({
	eventTags: many(eventTags),
	rsO: one(rsOs, {
		fields: [events.rsoId],
		references: [rsOs.rsoId]
	}),
	user: one(users, {
		fields: [events.createdBy],
		references: [users.netId]
	}),
	location: one(locations, {
		fields: [events.locationId],
		references: [locations.locationId]
	}),
	rsvPs: many(rsvPs),
}));

export const tagsRelations = relations(tags, ({many}) => ({
	eventTags: many(eventTags),
}));

export const rsOsRelations = relations(rsOs, ({many}) => ({
	events: many(events),
	rsoMemberships: many(rsoMemberships),
}));

export const usersRelations = relations(users, ({many}) => ({
	events: many(events),
	localAccounts: many(localAccounts),
	midterms: many(midterms),
	rsoMemberships: many(rsoMemberships),
	rsvPs: many(rsvPs),
}));

export const facilityReservationsRelations = relations(facilityReservations, ({one}) => ({
	location: one(locations, {
		fields: [facilityReservations.locationId],
		references: [locations.locationId]
	}),
}));

export const localAccountsRelations = relations(localAccounts, ({one}) => ({
	user: one(users, {
		fields: [localAccounts.netId],
		references: [users.netId]
	}),
}));

export const midtermsRelations = relations(midterms, ({one, many}) => ({
	course: one(courses, {
		fields: [midterms.courseCode],
		references: [courses.courseCode]
	}),
	user: one(users, {
		fields: [midterms.submittedBy],
		references: [users.netId]
	}),
	location: one(locations, {
		fields: [midterms.locationId],
		references: [locations.locationId]
	}),
}));

export const rsoMembershipsRelations = relations(rsoMemberships, ({one}) => ({
	user: one(users, {
		fields: [rsoMemberships.netId],
		references: [users.netId]
	}),
	rsO: one(rsOs, {
		fields: [rsoMemberships.rsoId],
		references: [rsOs.rsoId]
	}),
}));

export const rsvPsRelations = relations(rsvPs, ({one}) => ({
	user: one(users, {
		fields: [rsvPs.netId],
		references: [users.netId]
	}),
	event: one(events, {
		fields: [rsvPs.eventId],
		references: [events.eventId]
	}),
}));

export const unknownBuildingCodesRelations = relations(unknownBuildingCodes, ({one}) => ({
	pollLog: one(pollLog, {
		fields: [unknownBuildingCodes.logId],
		references: [pollLog.logId]
	}),
}));

export const pollLogRelations = relations(pollLog, ({many}) => ({
	unknownBuildingCodes: many(unknownBuildingCodes),
}));