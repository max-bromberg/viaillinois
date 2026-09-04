import { relations } from "drizzle-orm/relations";
import { courses, courseSections, locations, events, eventSeries, eventTags, tags, rsOs, users, facilityReservations, localAccounts, midterms, rsoMemberships, rsvPs, pollLog, unknownBuildingCodes, discordLinks, eventInterest, eventFeedback, personalCalendars } from "./schema.ts";

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

export const eventSeriesRelations = relations(eventSeries, ({one, many}) => ({
	events: many(events),
	rsO: one(rsOs, {
		fields: [eventSeries.rsoId],
		references: [rsOs.rsoId]
	}),
	user: one(users, {
		fields: [eventSeries.createdBy],
		references: [users.netId]
	}),
}));

export const eventsRelations = relations(events, ({one, many}) => ({
	eventTags: many(eventTags),
	eventInterest: many(eventInterest),
	eventFeedback: many(eventFeedback),
	series: one(eventSeries, {
		fields: [events.seriesId],
		references: [eventSeries.seriesId]
	}),
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
	discordLinks: many(discordLinks),
	eventFeedback: many(eventFeedback),
	personalCalendars: many(personalCalendars),
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
export const discordLinksRelations = relations(discordLinks, ({one}) => ({
	user: one(users, {
		fields: [discordLinks.netId],
		references: [users.netId]
	}),
}));

export const eventInterestRelations = relations(eventInterest, ({one}) => ({
	event: one(events, {
		fields: [eventInterest.eventId],
		references: [events.eventId]
	}),
}));

export const eventFeedbackRelations = relations(eventFeedback, ({one}) => ({
	event: one(events, {
		fields: [eventFeedback.eventId],
		references: [events.eventId]
	}),
	user: one(users, {
		fields: [eventFeedback.netId],
		references: [users.netId]
	}),
}));

export const personalCalendarsRelations = relations(personalCalendars, ({one}) => ({
	user: one(users, {
		fields: [personalCalendars.netId],
		references: [users.netId]
	}),
}));
