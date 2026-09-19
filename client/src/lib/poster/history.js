/**
 * Undo and redo for the poster designer.
 *
 * A designer without undo is one nobody experiments in, and experimenting is
 * the whole of what a board came here to do. Because a poster document is a
 * value that every edit answers with a new copy of, the history can be the
 * documents themselves rather than a list of changes and how to put each one
 * back, which is both simpler and impossible to get out of step with what is
 * on the screen.
 */

/** How many steps back a board can go, which bounds a long session. */
const DEPTH = 100;

/** A history holding one document, with nothing behind it and nothing ahead. */
export function newHistory(present) {
  return { past: [], present, future: [], reason: null };
}

export const canUndo = history => history.past.length > 0;
export const canRedo = history => history.future.length > 0;

/**
 * Write a document into the history.
 *
 * A reason names what kind of change this was. A drag is hundreds of small
 * moves, and a history with a step for each of them is one nobody can get back
 * out of, so a change that carries the same reason as the one before it
 * replaces that step instead of adding another. A change with no reason always
 * adds a step of its own.
 */
export function record(history, present, reason = null) {
  if (present === history.present) return history;

  const folding = reason !== null && reason === history.reason;
  const past = folding ? history.past : [...history.past, history.present].slice(-DEPTH);
  return { past, present, future: [], reason };
}

/** The document that was there before this one. */
export function undo(history) {
  if (!canUndo(history)) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past.at(-1),
    future: [history.present, ...history.future],
    reason: null,
  };
}

/** The document that was undone. */
export function redo(history) {
  if (!canRedo(history)) return history;
  return {
    past: [...history.past, history.present],
    present: history.future[0],
    future: history.future.slice(1),
    reason: null,
  };
}
