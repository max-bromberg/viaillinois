import { describe, it, expect } from 'vitest';
import { rankLocations, resolveRoom } from '../../lib/locationSearch.js';

/**
 * Rooms as they actually appear in the Locations table, including the two
 * spellings of the same building that the pollers have produced. Ad Astra
 * writes one and Course Explorer writes the other, so a search for ECEB has to
 * find both or it silently hides half the rooms in the building.
 */
const ROOMS = [
  { location_id: 1,  building: 'Electrical & Computer Eng Bldg',               room_number: '1002' },
  { location_id: 2,  building: 'Electrical & Computer Eng Bldg',               room_number: '1013' },
  { location_id: 3,  building: 'Electrical and Computer Engineering Building', room_number: '3017' },
  { location_id: 4,  building: 'Campus Instructional Facility',                room_number: '1025' },
  { location_id: 5,  building: 'Siebel Center for Comp Sci',                   room_number: '1404' },
  { location_id: 6,  building: 'Coordinated Science Laboratory',               room_number: '301'  },
  { location_id: 7,  building: 'Everitt Laboratory',                           room_number: '1002' },
  { location_id: 8,  building: 'Illini Union',                                 room_number: 'Ballroom' },
];

const idsFor = (q, limit = 10) => rankLocations(q, ROOMS, limit).map(r => r.location_id);

describe('rankLocations', () => {
  it('expands a building code to every room in that building', () => {
    expect(idsFor('ECEB').sort()).toEqual([1, 2, 3]);
  });

  it('finds both spellings of a building the pollers disagree about', () => {
    const buildings = rankLocations('ECEB', ROOMS, 10).map(r => r.building);
    expect(new Set(buildings).size).toBe(2);
  });

  it('is case insensitive about the code', () => {
    expect(idsFor('eceb').sort()).toEqual([1, 2, 3]);
  });

  it('splits a code written against a room number with no space', () => {
    expect(idsFor('eceb1002')).toEqual([1]);
  });

  it('handles the same thing written with a space', () => {
    expect(idsFor('ECEB 1002')).toEqual([1]);
  });

  it('matches a building by a word in its name', () => {
    expect(idsFor('siebel')).toEqual([5]);
  });

  it('matches a word from the middle of the stored name', () => {
    expect(idsFor('electrical').sort()).toEqual([1, 2, 3]);
  });

  it('matches on a partial word, so typing need not be finished', () => {
    expect(idsFor('coord')).toEqual([6]);
  });

  it('finds a bare room number across buildings', () => {
    expect(idsFor('1002').sort()).toEqual([1, 7]);
  });

  it('matches a room that is named rather than numbered', () => {
    expect(idsFor('ballroom')).toEqual([8]);
  });

  it('ranks an exact room in the named building above the same room elsewhere', () => {
    expect(idsFor('everitt 1002')[0]).toBe(7);
  });

  it('returns nothing for a term that matches no room', () => {
    expect(idsFor('krannert')).toEqual([]);
  });

  it('returns nothing for an empty term rather than everything', () => {
    expect(idsFor('')).toEqual([]);
    expect(idsFor('   ')).toEqual([]);
  });

  it('respects the limit', () => {
    expect(rankLocations('ECEB', ROOMS, 2)).toHaveLength(2);
  });

  it('ignores punctuation and the difference between and and ampersand', () => {
    expect(idsFor('electrical & computer').sort()).toEqual([1, 2, 3]);
    expect(idsFor('electrical and computer').sort()).toEqual([1, 2, 3]);
  });
});

/**
 * Resolving a calendar's LOCATION line is a different question from searching.
 * A person searching can look at several results and choose; an importer has
 * to decide alone, so it only claims a room when the text names both a
 * building and a room number. Anything vaguer is kept as written, because a
 * wrong room is worse than no room.
 */
describe('resolveRoom', () => {
  const resolve = (text) => {
    const room = resolveRoom(text, ROOMS);
    return room ? room.location_id : null;
  };

  it('resolves a building and room written together', () => {
    expect(resolve('ECEB 1002')).toBe(1);
    expect(resolve('eceb1002')).toBe(1);
  });

  it('resolves the full building name with a room', () => {
    expect(resolve('Siebel Center for Comp Sci 1404')).toBe(5);
  });

  it('refuses a bare room number, which names no building', () => {
    expect(resolve('1002')).toBeNull();
  });

  it('refuses a building with no room, because it does not say where', () => {
    expect(resolve('ECEB')).toBeNull();
    expect(resolve('Illini Union')).toBeNull();
  });

  it('refuses text that is not a room at all', () => {
    expect(resolve('Zoom')).toBeNull();
    expect(resolve('')).toBeNull();
    expect(resolve('See the group chat')).toBeNull();
  });

  it('resolves a named room when the building is named too', () => {
    expect(resolve('Illini Union Ballroom')).toBe(8);
  });
});
