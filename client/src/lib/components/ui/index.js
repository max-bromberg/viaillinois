/**
 * The design system's parts.
 *
 * The primitives are the shapes the look is made of, each taken from the mark:
 * the pad, the cut, the lamp, the highlighter, the sky and the numeral. The
 * composed parts are what the surfaces are built from. See
 * docs/design/07-components.md.
 */

// Primitives.
export { Pad } from './Pad/index.js';
export { Cut } from './Cut/index.js';
export { Lamp } from './Lamp/index.js';
export { Highlight } from './Highlight/index.js';
export { Sky } from './Sky/index.js';
export { Numeral } from './Numeral/index.js';

// The two the site draws that the component document gained later: icons are
// drawn rather than typed, and the mark is inlined because it is white on the
// kiosk and on the night sky and an image cannot be recoloured.
export { Icon, ICONS } from './Icon/index.js';
export { Mark } from './Mark/index.js';
export { Trace } from './Trace/index.js';

// Controls.
export { Button } from './Button/index.js';
export { Field } from './Field/index.js';
export { Switch } from './Switch/index.js';
export { Dial } from './Dial/index.js';
export { Toast } from './Toast/index.js';
export { EmptyState } from './EmptyState/index.js';

// The sky band and the agenda.
export { SkyBand } from './SkyBand/index.js';
export { Nav } from './Nav/index.js';
export { Greeting } from './Greeting/index.js';
export { Qr } from './Qr/index.js';
export { Clock } from './Clock/index.js';
export { DayGroup } from './DayGroup/index.js';
export { EventRow } from './EventRow/index.js';

// The event page.
export { Poster } from './Poster/index.js';

// The midterm schedule.
export { TermRibbon } from './TermRibbon/index.js';
export { ExamRow } from './ExamRow/index.js';

// The kiosk.
export { KioskStage } from './KioskStage/index.js';
export { KioskRail } from './KioskRail/index.js';
