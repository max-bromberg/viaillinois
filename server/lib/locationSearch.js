import { BUILDING_CODES } from './buildingCodes.js';

/**
 * Ranked room search over the Locations table.
 *
 * The problem it solves is that Locations stores full building names, such as
 * "Electrical & Computer Eng Bldg", while people type codes, such as ECEB. On
 * top of that the pollers have written two spellings of some buildings, so
 * "Electrical and Computer Engineering Building" names the same place. Matching
 * on whole strings finds neither case.
 *
 * So both sides are reduced to word prefixes. A row matches when every word in
 * the query is the start of some word in the building name or room number. That
 * makes "eng" find "Engineering", "coord" find "Coordinated", and a code find
 * both spellings of its building once the code is expanded to its name.
 */

/** Words that carry no distinguishing information in a building name. */
const GENERIC = new Set(['and', 'of', 'the', 'bldg', 'building', 'ctr', 'facility']);

/** Lowercase, spell out the ampersand, and drop everything that is not a word. */
function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(text) {
  const normalized = normalize(text);
  return normalized ? normalized.split(' ') : [];
}

/** Export for the importer, which needs the same word splitting. */
export { tokenize };

/**
 * Turn what was typed into the words to match on.
 *
 * A token that is a building code becomes the distinguishing words of that
 * building's name, so ECEB becomes electrical, computer, eng. A code written
 * straight onto a room number, as in eceb1002, is split first.
 */
export function expandQuery(query) {
  const expanded = [];
  for (const token of tokenize(query)) {
    const split = /^([a-z]+)(\d.*)$/.exec(token);
    const code = (split ? split[1] : token).toUpperCase();
    const canonical = BUILDING_CODES[code];

    if (canonical) {
      expanded.push(...tokenize(canonical).filter(word => !GENERIC.has(word)));
      if (split) expanded.push(split[2]);
    } else {
      expanded.push(token);
    }
  }
  return expanded;
}

/**
 * Score one room against the expanded query, or return null when it does not
 * match. Every query word has to land somewhere, so extra words narrow the
 * result rather than widening it.
 *
 * An exact word is worth more than a prefix of one, and a hit on the room
 * number is worth more than a hit on the building, which is what puts
 * "Everitt 1002" above the other room 1002 on campus.
 */
export function scoreLocation(queryWords, location) {
  const buildingWords = tokenize(location.building);
  const roomWords = tokenize(location.room_number);

  let score = 0;
  for (const word of queryWords) {
    const exactRoom = roomWords.includes(word);
    const prefixRoom = roomWords.some(w => w.startsWith(word));
    const exactBuilding = buildingWords.includes(word);
    const prefixBuilding = buildingWords.some(w => w.startsWith(word));

    if (exactRoom) score += 8;
    else if (prefixRoom) score += 5;
    else if (exactBuilding) score += 3;
    else if (prefixBuilding) score += 2;
    else return null;
  }
  return score;
}

/**
 * Rank rooms for a search term, best first.
 *
 * An empty term returns nothing rather than everything, because a search box
 * that lists the whole campus before a key is pressed is not a search box.
 *
 * @param {string} query what was typed
 * @param {Array<{location_id: number, building: string, room_number: string}>} locations
 * @param {number} [limit=10]
 */
export function rankLocations(query, locations, limit = 10) {
  const queryWords = expandQuery(query);
  if (queryWords.length === 0) return [];

  return locations
    .map(location => ({ location, score: scoreLocation(queryWords, location) }))
    .filter(scored => scored.score !== null)
    .sort((a, b) =>
      b.score - a.score ||
      a.location.building.localeCompare(b.location.building) ||
      a.location.room_number.localeCompare(b.location.room_number, undefined, { numeric: true })
    )
    .slice(0, limit)
    .map(scored => scored.location);
}

/**
 * Decide which room a calendar's LOCATION line names, or nothing.
 *
 * Searching and resolving are different problems. A person searching can look
 * at several results and pick one; an importer has to decide alone and has no
 * way to ask. So this only claims a room when the text names both a building
 * and a room number, and keeps quiet otherwise. "ECEB 1002" resolves. A bare
 * "1002" does not, because it is a room in eight buildings. "Illini Union"
 * does not, because it does not say where in the building. "Zoom" does not,
 * because it is not a room.
 *
 * The caller keeps the original text either way, so nothing is lost by
 * declining, whereas a wrong room misdirects everyone who reads the listing.
 *
 * @param {string} text the LOCATION line as written
 * @param {Array<{location_id: number, building: string, room_number: string}>} locations
 * @returns {{location_id: number, building: string, room_number: string}|null}
 */
export function resolveRoom(text, locations) {
  const queryWords = expandQuery(text);
  if (queryWords.length === 0) return null;

  const ranked = rankLocations(text, locations, 1);
  if (ranked.length === 0) return null;

  const best = ranked[0];
  const buildingWords = tokenize(best.building);
  const roomWords = tokenize(best.room_number);

  const namesRoom = queryWords.some(word => roomWords.includes(word));
  const namesBuilding = queryWords.some(word => buildingWords.some(w => w.startsWith(word)));

  return namesRoom && namesBuilding ? best : null;
}
