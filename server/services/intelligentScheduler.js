import { getByCapacity } from '../db/queries/locations.js';
import { getPublicEvents } from '../db/queries/events.js';
import { getConfirmedMidtermsForScheduler } from '../db/queries/midterms.js';
import { getSectionsForCourses } from '../db/queries/courses.js';
import { getReservationsInRange } from '../db/queries/facilityReservations.js';

const SENSITIVITY = {
  low:    { windowHours: 36,  scalar: 0.5 },
  medium: { windowHours: 72,  scalar: 1.0 },
  high:   { windowHours: 120, scalar: 2.0 },
};

const TIER_PENALTIES = { strongly_preferred: 35, nice_to_have: 10 };
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
  } = params;

  const { windowHours, scalar } = SENSITIVITY[midtermSensitivity] ?? SENSITIVITY.medium;

  const [ey, em, ed] = dateRange.end.split('-').map(Number);
  const midtermEnd = new Date(ey, em - 1, ed, 23, 59, 59, 999);
  midtermEnd.setTime(midtermEnd.getTime() + windowHours * 3_600_000);
  const midtermEndStr = midtermEnd.toISOString().slice(0, 19).replace('T', ' ');

  const [allEvents, targetMidterms, allReservations, allLocations, allSections] = await Promise.all([
    getPublicEvents({ startDate: dateRange.start, endDate: dateRange.end, limit: 1000 }),
    getConfirmedMidtermsForScheduler({
      startDate: dateRange.start,
      endDate: midtermEndStr,
      courseCodes: targetCourses,
    }),
    getReservationsInRange(dateRange.start, dateRange.end),
    getByCapacity(0),
    targetCourses.length > 0 ? getSectionsForCourses(targetCourses) : Promise.resolve([]),
  ]);

  const excludedSet = new Set(excludedRooms.map(r => r.location_id ?? r));

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
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
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
      insights.push({ type: 'positive', text: `${loc.building} — your preferred building` });
    }
  }

  return { disqualified: false, scoreDelta, insights };
}

function scoreSlot(slot, loc, data) {
  let score = 100;
  const insights = [];
  const { allEvents, targetMidterms, allReservations, allSections,
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
      insights.push({ type: 'warning', text: `Outside your preferred ${timeConstraint.startHour}:00–${timeConstraint.endHour}:00 window` });
    } else {
      insights.push({ type: 'positive', text: `Within your preferred time window` });
    }
  }

  if (slot.dayTier === 'required') {
    insights.push({ type: 'positive', text: `${slot.dayName} — your Required day` });
  } else if (slot.dayTier === 'strongly_preferred') {
    insights.push({ type: 'positive', text: `${slot.dayName} — Strongly Preferred` });
  } else if (slot.dayTier === 'nice_to_have') {
    insights.push({ type: 'neutral', text: `${slot.dayName} — Nice to Have` });
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
    if (hoursUntil <= 0) penalty = Math.round(50 * scalar);   // midterm overlaps or is simultaneous — maximum
    else if (hoursUntil <= 24) penalty = Math.round(40 * scalar);
    else if (hoursUntil <= 48) penalty = Math.round(20 * scalar);
    else penalty = Math.round(8 * scalar);

    score -= penalty;
    midtermWarnings.push({ course: m.course_code, hours: Math.round(hoursUntil) });
  }
  if (midtermWarnings.length > 0) {
    const worst = midtermWarnings.reduce((a, b) => a.hours < b.hours ? a : b);
    const worstText = worst.hours <= 0
      ? `${worst.course} midterm is happening at this time — direct conflict`
      : `${worst.course} midterm in ${worst.hours}h — academic pressure on target audience`;
    insights.push({ type: 'warning', text: worstText });
  } else if (targetMidterms.length > 0) {
    insights.push({ type: 'positive', text: `No target midterms within ${windowHours}h of this slot` });
  }

  const competing = allEvents.filter(e => overlaps(e.start_time, e.end_time, slot.start, slot.end));
  if (competing.length > 0) {
    score -= Math.min(45, competing.length * 15);
    insights.push({ type: 'warning', text: `${competing.length} other RSO event${competing.length > 1 ? 's' : ''} at this time — attendance may split` });
  } else {
    insights.push({ type: 'positive', text: `No competing RSO events` });
  }

  const buildingReservations = allReservations.filter(r =>
    r.building === loc.building && overlaps(r.start_time, r.end_time, slot.start, slot.end)
  );
  if (buildingReservations.length > 0) {
    score -= Math.min(15, buildingReservations.length * 5);
    insights.push({ type: 'neutral', text: `${buildingReservations.length} external event${buildingReservations.length > 1 ? 's' : ''} in ${loc.building} at this time` });
  }

  return { score, insights };
}

function pickCurated(sortedResults) {
  const seenDays = new Set();
  const picks = [];
  for (const rec of sortedResults) {
    const day = rec.start.slice(0, 10);
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
