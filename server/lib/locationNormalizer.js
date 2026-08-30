/**
 * locationNormalizer.js
 *
 * Pure, synchronous functions for canonicalizing building names and room numbers
 * before any DB write. Ensures the same physical room always maps to the same
 * (building, room_number) string pair, and therefore the same location_id,
 * regardless of which poller discovered it.
 *
 * Building name sources:
 *   Ad Astra    → short codes with campus prefix digit, e.g. "1ECEB"
 *   Tableau     → full HTML names, e.g. "Electrical &amp; Computer Eng Bldg"
 *   Course Exp. → full names, already clean, e.g. "Electrical & Computer Eng Bldg"
 */

const BUILDING_CODE_MAP = {
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
  'CAB':    'Central Administrative Building',
};

const _unknownCodes = new Set();

// Short-code pattern: optional leading digit (campus prefix) + 2-6 uppercase letters/digits.
const SHORT_CODE_RE = /^\d?[A-Z][A-Z0-9]{1,5}$/;

function htmlDecode(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function resolveBuilding(input) {
  if (!input) return '';
  const trimmed = input.trim();
  if (!trimmed) return '';

  if (SHORT_CODE_RE.test(trimmed)) {
    const code = /^\d/.test(trimmed) ? trimmed.slice(1) : trimmed;
    const canonical = BUILDING_CODE_MAP[code];
    if (canonical) return canonical;
    console.warn(`[normalizer] unknown building code: ${code} (raw: "${input}")`);
    _unknownCodes.add(code);
    return code;
  }

  return htmlDecode(trimmed);
}

export function resolveRoom(input) {
  if (!input) return '';
  return input.trim();
}

/** Returns all unknown building codes seen since the last call, then clears the collector. */
export function drainUnknownCodes() {
  const codes = [..._unknownCodes];
  _unknownCodes.clear();
  return codes;
}
