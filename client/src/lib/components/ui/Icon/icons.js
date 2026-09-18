/**
 * The ten shapes the reference render draws.
 *
 * The first version of the site used emoji as icons. They draw differently on
 * every platform, so the page had one face on a phone and another on the lobby
 * screen, and none of them was the site's. These are drawn at the stroke weight
 * of the traces in the mark, in the colour of whatever text they sit in.
 *
 * Adding a shape means adding it to the reference render first; see
 * docs/design/07-components.md.
 */
export const ICONS = {
  pin: '<path d="M12 21s-6-5.4-6-10a6 6 0 0 1 12 0c0 4.6-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z"/>',
  share: '<circle cx="6" cy="12" r="2.3"/><circle cx="18" cy="6" r="2.3"/><circle cx="18" cy="18" r="2.3"/><path d="M8 11l8-4M8 13l8 4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
  moon: '<path d="M20 13.5A8 8 0 0 1 10.5 4a8 8 0 1 0 9.5 9.5z"/>',
  // A step one along, rather than a journey to somewhere. Drawn on the chamfer's
  // own 45 degrees, which is the angle the cut takes on every card, button and
  // band, so a direction reads as part of the same geometry as everything else.
  next: '<path d="M9 5l7 7-7 7"/>',
  prev: '<path d="M15 5l-7 7 7 7"/>',
  // The sign off in the footer. Drawn rather than typed, because the emoji it
  // replaces renders as a flat glyph on one platform and a colour picture on
  // another, so the page had one face on a phone and another on the lobby
  // screen, which is the whole reason this set exists.
  heart: '<path d="M12 20s-7-4.6-7-9.4A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7 2.6C19 15.4 12 20 12 20z"/>',
};
