/**
 * Short building codes and the canonical names they stand for.
 *
 * Two things read this. locationNormalizer.js uses it to canonicalize a name
 * before writing a Locations row, so that every poller agrees on the spelling.
 * locationSearch.js uses it in the other direction, so that someone typing
 * ECEB into the venue search finds rooms stored under the full name.
 *
 * Note that intelligentScheduler.js keeps a much shorter list of its own. That
 * is not a stale copy of this one: it is a deliberate subset naming the
 * engineering buildings that scheduler considers relevant to ECE events, and
 * widening it to all of campus would change which rooms that feature offers.
 */
export const BUILDING_CODES = {
   'ECEB':   'Electrical & Computer Eng Bldg',
   'CIF':    'Campus Instructional Facility',
   'CSL':    'Coordinated Science Laboratory',
   'DCL':    'Digital Computer Laboratory',
   'SC':     'Siebel Center for Comp Sci',
   'MEB':    'Mechanical Engineering Building',
   'TB':     'Transportation Building',
   'AH':     'Altgeld Hall',
   'TH':     'Talbot Laboratory',
   'EH':     'Everitt Laboratory',
   'NHB':    'Natural History Building',
   'LH':     'Lincoln Hall',
   'GH':     'Gregory Hall',
   'MSEB':   'Materials Science & Eng Bldg',
   'BUR':    'Burrill Hall',
   'IH':     'Illini Hall',
   'FLB':    'Foreign Languages Building',
   'DKH':    'Davenport Hall',
   'LIS':    'Library & Information Science',
   'CB':     'Chemistry Annex',
   'RAL':    'Rundell Atkins Laboratory',
   'MRL':    'Materials Research Laboratory',
   'NCEL':   'Newmark Civil Engineering Lab',
   'MNTL':   'Micro & Nano Technology Lab',
   'NCSA':   'National Ctr for Supercomputing',
   'BH':     'Bevier Hall',
   'HH':     'Henry Administration Building',
   'KH':     'Krannert Art Museum',
   'SB':     'Smith Memorial Hall',
   'CAB':    'Central Administrative Building',  // Written the way people type it rather than as an official abbreviation.
  'SIEBEL': 'Siebel Center for Comp Sci',
};
