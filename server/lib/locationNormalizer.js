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

import { BUILDING_CODES } from './buildingCodes.js';

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
    const canonical = BUILDING_CODES[code];
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
