import { getByCapacity } from '../db/queries/locations.js';
import { getPublicEvents } from '../db/queries/events.js';
import { getConfirmedMidtermsForScheduler } from '../db/queries/midterms.js';
import { getSectionsForCourses } from '../db/queries/courses.js';
import { getReservationsInRange } from '../db/queries/facilityReservations.js';
import { expandOccurrences, addMinutes } from '../lib/recurrence.js';
import { termForDate } from '../lib/academicCalendar.js';

const SENSITIVITY = {
  low:    { windowHours: 36,  scalar: 0.5 },
  medium: { windowHours: 72,  scalar: 1.0 },
  high:   { windowHours: 120, scalar: 2.0 },
};

const TIER_PENALTIES = { strongly_preferred: 35, nice_to_have: 10 };

/**
 * Read a Date built from calendar components back as the wall clock it stands
 * for, in the shape everything else in the database is stored in.
 *
 * Every Date in this file is assembled from an explicit year, month, day and
 * hour rather than from an instant, so its calendar fields are the reading that
 * was meant. Converting one to UTC instead moved the whole recommendation by
 * the offset of whatever container the scheduler happened to run in.
 */
function wallClock(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Maps the short codes used in the UI to the canonical building names stored in
// the Locations table (written by locationNormalizer.js during poller runs).
const BUILDING_CANONICAL = {
  'ECEB':   'Electrical & Computer Eng Bldg',
  'CIF':    'Campus Instructional Facility',
  'CSL':    'Coordinated Science Laboratory',
  'Siebel': 'Siebel Center for Comp Sci',
};

// Only consider north engineering buildings relevant to ECE events
const ECE_BUILDINGS = new Set(Object.values(BUILDING_CANONICAL));

function canonicalBuilding(b) { return BUILDING_CANONICAL[b] ?? b; }

export async function recommend(params) {
  const {
    durationMinutes = 60,
    dateRange,
    timeConstraint = null,
    dayConstraints = [],
    venueConstraints = { buildings: [], specificRoom: null },
    excludedRooms = [],
    targetCourses = [],
    midtermSensitivity = 'medium',
    recurrence = null,
  } = params;

  const { windowHours, scalar } = SENSITIVITY[midtermSensitivity] ?? SENSITIVITY.medium;

  // A repeating event is searched to the end of the repeat, which is usually
  // the end of the term, so everything already in the calendar until then has
  // to be looked at rather than only the week the form was filled in.
  const searchEnd = recurrence?.until && recurrence.until > dateRange.end
    ? recurrence.until
    : dateRange.end;

  const [ey, em, ed] = searchEnd.split('-').map(Number);
  const midtermEnd = new Date(ey, em - 1, ed, 23, 59, 59, 999);
  midtermEnd.setTime(midtermEnd.getTime() + windowHours * 3_600_000);
  const midtermEndStr = wallClock(midtermEnd);

  const [allEvents, targetMidterms, allReservations, allLocations, allSections] = await Promise.all([
    getPublicEvents({ startDate: dateRange.start, endDate: searchEnd, limit: 1000 }),
    getConfirmedMidtermsForScheduler({
      startDate: dateRange.start,
      endDate: midtermEndStr,
      courseCodes: targetCourses,
    }),
    getReservationsInRange(dateRange.start, searchEnd),
    getByCapacity(0),
    targetCourses.length > 0 ? getSectionsForCourses(targetCourses) : Promise.resolve([]),
  ]);

  const excludedSet = new Set(excludedRooms.map(r => r.location_id ?? r));
  const scoringData = {
    allEvents, targetMidterms, allReservations, allSections,
    timeConstraint, scalar, windowHours,
  };
  const roomFilter = { excludedSet, venueConstraints };

  if (recurrence) {
    const results = recurringOptions({
      recurrence, dateRange, searchEnd, durationMinutes, timeConstraint, dayConstraints,
      allLocations, roomFilter, data: scoringData,
    });
    results.sort((a, b) => b.score - a.score);
    return {
      // One slot per hour of the day rather than the same evening many times
      // over: a repeat is chosen by its hour, not by its first date.
      curatedPicks: pickCurated(results, rec => rec.start.slice(11, 16)),
      allOptions: results.slice(0, 20),
    };
  }

  const slots = generateSlots(dateRange.start, dateRange.end, durationMinutes, timeConstraint, dayConstraints);
  const results = [];

  for (const slot of slots) {
    const occupiedIds = buildOccupiedSet(slot, allEvents, allReservations, allLocations);

    for (const loc of allLocations) {
      if (!ECE_BUILDINGS.has(loc.building)) continue;
      if (occupiedIds.has(loc.location_id)) continue;
      if (excludedSet.has(loc.location_id)) continue;

      const venueResult = applyVenueConstraints(loc, venueConstraints);
      if (venueResult.disqualified) continue;

      const { score, insights } = scoreSlot(slot, loc, {
        allEvents, targetMidterms, allReservations, allSections,
        timeConstraint, scalar, windowHours,
      });

      const finalScore = Math.max(0, Math.min(100, score + venueResult.scoreDelta));
      if (finalScore <= 0) continue;

      results.push({
        start: slot.start,
        end: slot.end,
        location: {
          location_id: loc.location_id,
          building: loc.building,
          room_number: loc.room_number,
          max_capacity: loc.max_capacity,
        },
        score: Math.round(finalScore),
        insights: [...insights, ...venueResult.insights],
      });
    }
  }

  results.sort((a, b) => b.score - a.score);

  return {
    curatedPicks: pickCurated(results),
    allOptions: results.slice(0, 20),
  };
}

/**
 * The hours of the day a slot of this length can start at, on the half hour,
 * inside whatever window the organizer asked for.
 */
function startTimesOfDay(durationMins, timeConstraint) {
  const startH = timeConstraint?.startHour ?? 8;
  const endH = timeConstraint?.endHour ?? 22;
  const times = [];
  for (let h = startH; h < endH; h++) {
    for (const mins of [0, 30]) {
      const start = `${String(h).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`;
      const end = addMinutes(`2000-01-01 ${start}`, durationMins);
      // An hour that would run past the end of the window, or past midnight,
      // is not a slot.
      if (end.slice(0, 10) !== '2000-01-01') continue;
      if (end.slice(11) > `${String(endH).padStart(2, '0')}:00:00`) continue;
      times.push(start);
    }
  }
  return times;
}

/**
 * Score a weekday and an hour across every week a repeat would run.
 *
 * A room is judged on the whole term rather than on one evening: a week where
 * it is taken scores nothing and is named in the result, and the slot's score
 * is the mean over its weeks, so one bad week lowers a slot without hiding it.
 * A room that is taken every single week is not offered at all.
 */
function recurringOptions({
  recurrence, dateRange, searchEnd, durationMinutes, timeConstraint, dayConstraints,
  allLocations, roomFilter, data,
}) {
  const requiredDays = new Set(dayConstraints.filter(d => d.tier === 'required').map(d => d.day));
  const excludedDays = new Set(dayConstraints.filter(d => d.tier === 'excluded').map(d => d.day));
  const dayTierMap = Object.fromEntries(dayConstraints.map(d => [d.day, d.tier]));

  const asked = recurrence.daysOfWeek?.length ? recurrence.daysOfWeek : DAY_NAMES;
  const daysOfWeek = asked.filter(day =>
    !excludedDays.has(day) && (requiredDays.size === 0 || requiredDays.has(day)));
  if (daysOfWeek.length === 0) return [];

  // The dates a repeat set up from this recommendation would actually run on,
  // read from the same expansion the create endpoint uses, so a forecast and
  // the series it produces cover the same weeks.
  const term = termForDate(dateRange.start);
  const dates = expandOccurrences({
    startTime: `${dateRange.start} 00:00:00`,
    endTime: `${dateRange.start} 00:30:00`,
    daysOfWeek,
    intervalWeeks: recurrence.intervalWeeks ?? 1,
    startsOn: dateRange.start,
    endsOn: recurrence.until ?? searchEnd,
    skip: term.breaks ?? [],
  }).map(occurrence => occurrence.date);

  if (dates.length === 0) return [];

  const results = [];

  for (const time of startTimesOfDay(durationMinutes, timeConstraint)) {
    // Everything that does not depend on which room it is, worked out once per
    // week rather than once per week per room.
    const weeks = dates.map(date => {
      const start = `${date} ${time}`;
      const slot = {
        start,
        end: addMinutes(start, durationMinutes),
        dayName: DAY_NAMES[new Date(`${date}T12:00:00`).getDay()],
        dayTier: dayTierMap[DAY_NAMES[new Date(`${date}T12:00:00`).getDay()]] ?? null,
      };
      return {
        date,
        slot,
        occupied: buildOccupiedSet(slot, data.allEvents, data.allReservations, allLocations),
        base: scoreSlotBase(slot, data),
      };
    });

    for (const loc of allLocations) {
      if (!ECE_BUILDINGS.has(loc.building)) continue;
      if (roomFilter.excludedSet.has(loc.location_id)) continue;

      const venueResult = applyVenueConstraints(loc, roomFilter.venueConstraints);
      if (venueResult.disqualified) continue;

      const conflicts = weeks.filter(week => week.occupied.has(loc.location_id)).map(week => week.date);
      if (conflicts.length === weeks.length) continue;

      const total = weeks.reduce((sum, week) => {
        if (week.occupied.has(loc.location_id)) return sum;
        const room = scoreRoomAt(week.slot, loc, data);
        return sum + Math.max(0, Math.min(100, week.base.score + room.score + venueResult.scoreDelta));
      }, 0);

      const score = Math.round(total / weeks.length);
      if (score <= 0) continue;

      const clear = weeks.length - conflicts.length;
      const first = weeks[0];
      results.push({
        start: first.slot.start,
        end: first.slot.end,
        location: {
          location_id: loc.location_id,
          building: loc.building,
          room_number: loc.room_number,
          max_capacity: loc.max_capacity,
        },
        score,
        insights: [
          {
            type: conflicts.length === 0 ? 'positive' : 'warning',
            text: `This room is free for ${clear} of ${weeks.length} weeks`,
          },
          ...first.base.insights,
          ...scoreRoomAt(first.slot, loc, data).insights,
          ...venueResult.insights,
        ],
        recurrence: {
          interval_weeks: recurrence.intervalWeeks ?? 1,
          days_of_week: daysOfWeek,
          occurrences: dates,
          weeks_total: weeks.length,
          weeks_clear: clear,
          conflicts,
          until: dates.at(-1),
        },
      });
    }
  }

  return results;
}

function generateSlots(startStr, endStr, durationMins, timeConstraint, dayConstraints) {
  const startH = timeConstraint?.startHour ?? 8;
  const endH = timeConstraint?.endHour ?? 22;

  const requiredDays = new Set(dayConstraints.filter(d => d.tier === 'required').map(d => d.day));
  const excludedDays = new Set(dayConstraints.filter(d => d.tier === 'excluded').map(d => d.day));
  const dayTierMap = Object.fromEntries(dayConstraints.map(d => [d.day, d.tier]));

  const slots = [];
  // Parse YYYY-MM-DD as local midnight to avoid UTC-offset day-of-week skew
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  let current = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
  const endDay = new Date(ey, em - 1, ed, 23, 59, 59, 999);

  while (current <= endDay) {
    const dayName = DAY_NAMES[current.getDay()];

    if (excludedDays.has(dayName)) { current.setDate(current.getDate() + 1); continue; }
    if (requiredDays.size > 0 && !requiredDays.has(dayName)) { current.setDate(current.getDate() + 1); continue; }

    for (let h = startH; h < endH; h++) {
      for (const mins of [0, 30]) {
        const slotStart = new Date(current);
        slotStart.setHours(h, mins, 0, 0);
        const slotEnd = new Date(slotStart.getTime() + durationMins * 60_000);

        if (slotEnd.getHours() > endH || (slotEnd.getHours() === endH && slotEnd.getMinutes() > 0)) continue;

        slots.push({
          start: wallClock(slotStart),
          end: wallClock(slotEnd),
          dayName,
          dayTier: dayTierMap[dayName] ?? null,
        });
      }
    }
    current.setDate(current.getDate() + 1);
  }
  return slots;
}

function buildOccupiedSet(slot, allEvents, allReservations, allLocations) {
  const ids = new Set();
  const locationMap = new Map(allLocations.map(l => [`${l.building}:${l.room_number}`, l.location_id]));

  for (const e of allEvents) {
    if (overlaps(e.start_time, e.end_time, slot.start, slot.end)) {
      const locId = locationMap.get(`${e.building}:${e.room_number}`);
      if (locId) ids.add(locId);
    }
  }
  for (const r of allReservations) {
    if (overlaps(r.start_time, r.end_time, slot.start, slot.end)) ids.add(r.location_id);
  }
  return ids;
}

function applyVenueConstraints(loc, venueConstraints) {
  const { buildings = [], specificRoom = null } = venueConstraints;
  // Normalize incoming building names (client sends short codes like 'ECEB';
  // loc.building uses canonical names written by locationNormalizer.js)
  const normalizedBuildings = buildings.map(b => ({ ...b, building: canonicalBuilding(b.building) }));
  const insights = [];
  let scoreDelta = 0;

  if (specificRoom) {
    if (loc.location_id === specificRoom.location_id) {
      if (specificRoom.tier === 'required' || specificRoom.tier === 'strongly_preferred') {
        insights.push({ type: 'positive', text: `Your preferred room: ${loc.building} ${loc.room_number}` });
      }
    } else if (specificRoom.tier === 'required') {
      return { disqualified: true, scoreDelta: 0, insights: [] };
    } else {
      scoreDelta -= TIER_PENALTIES[specificRoom.tier] ?? 0;
      insights.push({ type: 'warning', text: `Not your preferred room (${loc.building} ${loc.room_number})` });
    }
  }

  if (normalizedBuildings.length > 0) {
    const buildingConstraint = normalizedBuildings.find(b => b.building === loc.building);
    if (!buildingConstraint) {
      const requiredBuildings = normalizedBuildings.filter(b => b.tier === 'required');
      if (requiredBuildings.length > 0) {
        return { disqualified: true, scoreDelta: 0, insights: [] };
      }
      const highestTier = normalizedBuildings.reduce((best, b) => {
        const rank = { required: 2, strongly_preferred: 1, nice_to_have: 0 };
        return rank[b.tier] > rank[best.tier] ? b : best;
      }, normalizedBuildings[0]);
      scoreDelta -= TIER_PENALTIES[highestTier.tier] ?? 0;
      insights.push({ type: 'warning', text: `${loc.building} is not among your preferred buildings` });
    } else if (buildingConstraint.tier === 'required' || buildingConstraint.tier === 'strongly_preferred') {
      insights.push({ type: 'positive', text: `${loc.building}, your preferred building` });
    }
  }

  return { disqualified: false, scoreDelta, insights };
}

/**
 * The score a slot earns wherever it is held.
 *
 * Split from the room specific part so that a recurring search can work this
 * out once per week rather than once per week per room, which is the
 * difference between a search that answers and one that times out.
 */
function scoreSlotBase(slot, data) {
  let score = 100;
  const insights = [];
  const { allEvents, targetMidterms, allSections,
          timeConstraint, scalar, windowHours } = data;

  const slotStart = new Date(slot.start);
  const slotEnd = new Date(slot.end);

  if (timeConstraint) {
    const slotH = slotStart.getHours();
    const inWindow = slotH >= timeConstraint.startHour &&
      (slotEnd.getHours() < timeConstraint.endHour ||
       (slotEnd.getHours() === timeConstraint.endHour && slotEnd.getMinutes() === 0));
    if (!inWindow) {
      score -= TIER_PENALTIES[timeConstraint.tier] ?? 0;
      insights.push({ type: 'warning', text: `Outside your preferred ${timeConstraint.startHour}:00 to ${timeConstraint.endHour}:00 window` });
    } else {
      insights.push({ type: 'positive', text: `Within your preferred time window` });
    }
  }

  if (slot.dayTier === 'required') {
    insights.push({ type: 'positive', text: `${slot.dayName}, your Required day` });
  } else if (slot.dayTier === 'strongly_preferred') {
    insights.push({ type: 'positive', text: `${slot.dayName}, Strongly Preferred` });
  } else if (slot.dayTier === 'nice_to_have') {
    insights.push({ type: 'neutral', text: `${slot.dayName}, Nice to Have` });
  } else if (slot.dayTier === null) {
    score -= 10;
  }

  const conflictingSections = allSections.filter(s => sectionOverlapsSlot(s, slotStart, slotEnd));
  if (conflictingSections.length > 0) {
    const lectures    = conflictingSections.filter(s => s.section_type === 'lecture');
    const smallGroup  = conflictingSections.filter(s => s.section_type !== 'lecture');

    if (lectures.length > 0) {
      const courses = [...new Set(lectures.map(s => s.course_code))];
      score -= Math.min(50, lectures.length * 35);
      insights.push({ type: 'warning', text: `Lecture in session: ${courses.join(', ')}` });
    }
    if (smallGroup.length > 0) {
      const courses = [...new Set(smallGroup.map(s => s.course_code))];
      const label   = smallGroup.every(s => s.section_type === 'lab') ? 'Lab' : 'Lab/discussion';
      score -= Math.min(10, smallGroup.length * 3);
      insights.push({ type: 'neutral', text: `${label} in session: ${courses.join(', ')} (${smallGroup.length} section${smallGroup.length > 1 ? 's' : ''})` });
    }
  } else if (allSections.length > 0) {
    insights.push({ type: 'positive', text: `No target course sections in session` });
  }

  const midtermWarnings = [];
  for (const m of targetMidterms) {
    const mStart = new Date(m.start_time);
    const hoursUntil = (mStart - slotEnd) / 3_600_000;
    if (hoursUntil > windowHours) continue;  // outside window entirely, skip

    let penalty;
    if (hoursUntil <= 0) penalty = Math.round(50 * scalar);   // midterm overlaps or is simultaneous, so this is the maximum
    else if (hoursUntil <= 24) penalty = Math.round(40 * scalar);
    else if (hoursUntil <= 48) penalty = Math.round(20 * scalar);
    else penalty = Math.round(8 * scalar);

    score -= penalty;
    midtermWarnings.push({ course: m.course_code, hours: Math.round(hoursUntil) });
  }
  if (midtermWarnings.length > 0) {
    const worst = midtermWarnings.reduce((a, b) => a.hours < b.hours ? a : b);
    const worstText = worst.hours <= 0
      ? `${worst.course} midterm is happening at this time, a direct conflict`
      : `${worst.course} midterm in ${worst.hours}h, academic pressure on target audience`;
    insights.push({ type: 'warning', text: worstText });
  } else if (targetMidterms.length > 0) {
    insights.push({ type: 'positive', text: `No target midterms within ${windowHours}h of this slot` });
  }

  const competing = allEvents.filter(e => overlaps(e.start_time, e.end_time, slot.start, slot.end));
  if (competing.length > 0) {
    score -= Math.min(45, competing.length * 15);
    insights.push({ type: 'warning', text: `${competing.length} other RSO event${competing.length > 1 ? 's' : ''} at this time, so attendance may split` });
  } else {
    insights.push({ type: 'positive', text: `No competing RSO events` });
  }

  return { score, insights };
}

/** What the room itself changes about a slot's score. */
function scoreRoomAt(slot, loc, data) {
  const buildingReservations = data.allReservations.filter(r =>
    r.building === loc.building && overlaps(r.start_time, r.end_time, slot.start, slot.end)
  );
  if (buildingReservations.length === 0) return { score: 0, insights: [] };

  return {
    score: -Math.min(15, buildingReservations.length * 5),
    insights: [{
      type: 'neutral',
      text: `${buildingReservations.length} external event${buildingReservations.length > 1 ? 's' : ''} in ${loc.building} at this time`,
    }],
  };
}

function scoreSlot(slot, loc, data) {
  const base = scoreSlotBase(slot, data);
  const room = scoreRoomAt(slot, loc, data);
  return { score: base.score + room.score, insights: [...base.insights, ...room.insights] };
}

function pickCurated(sortedResults, keyOf = rec => rec.start.slice(0, 10)) {
  const seenDays = new Set();
  const picks = [];
  for (const rec of sortedResults) {
    const day = keyOf(rec);
    if (!seenDays.has(day)) {
      seenDays.add(day);
      picks.push(rec);
      if (picks.length === 5) break;
    }
  }
  return picks;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart) < new Date(bEnd) && new Date(aEnd) > new Date(bStart);
}

function sectionOverlapsSlot(section, slotStart, slotEnd) {
  const slotDayName = DAY_NAMES[slotStart.getDay()];
  if (!dayMatchesSection(slotDayName, section.day_of_week)) return false;

  const [sh, sm] = section.start_time.split(':').map(Number);
  const [eh, em] = section.end_time.split(':').map(Number);
  const secStartMin = sh * 60 + sm;
  const secEndMin = eh * 60 + em;
  const slotStartMin = slotStart.getHours() * 60 + slotStart.getMinutes();
  const slotEndMin = slotEnd.getHours() * 60 + slotEnd.getMinutes();

  return secStartMin < slotEndMin && secEndMin > slotStartMin;
}

function dayMatchesSection(dayName, dayOfWeek) {
  if (!dayOfWeek || dayOfWeek === 'TBA' || dayOfWeek === 'ARRANGED') return false;

  const FULL_NAMES = {
    Sun: 'sunday', Mon: 'monday', Tue: 'tuesday', Wed: 'wednesday',
    Thu: 'thursday', Fri: 'friday', Sat: 'saturday',
  };
  const lower = dayOfWeek.toLowerCase();
  if (lower.includes(FULL_NAMES[dayName])) return true;

  const ABBREV_MAP = [
    ['Sa', 'Sat'], ['Su', 'Sun'],
    ['M', 'Mon'], ['T', 'Tue'], ['W', 'Wed'], ['R', 'Thu'], ['F', 'Fri'],
  ];
  const str = dayOfWeek.replace(/\s+/g, '');
  const daysInStr = new Set();
  let i = 0;
  while (i < str.length) {
    let matched = false;
    for (const [abbr, name] of ABBREV_MAP) {
      if (str.startsWith(abbr, i)) {
        daysInStr.add(name);
        i += abbr.length;
        matched = true;
        break;
      }
    }
    if (!matched) i++;
  }
  return daysInStr.has(dayName);
}
