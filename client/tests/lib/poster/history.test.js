import { describe, it, expect } from 'vitest';
import { canRedo, canUndo, newHistory, record, redo, undo } from '../../../src/lib/poster/history.js';

/**
 * Undo and redo.
 *
 * A designer without undo is one nobody experiments in, and experimenting is
 * the whole of what a board came here to do. A document is a value, so the
 * history is a list of documents and a place in it, which is both the simplest
 * thing that works and the one that cannot get out of step with the editor.
 */
describe('the history of a poster', () => {
  const a = { background: 'a', layers: [] };
  const b = { background: 'b', layers: [] };
  const c = { background: 'c', layers: [] };

  it('begins on the document it was opened with, with nothing to undo', () => {
    const history = newHistory(a);
    expect(history.present).toBe(a);
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });

  it('steps back to what was there before', () => {
    const history = record(newHistory(a), b);
    expect(canUndo(history)).toBe(true);
    expect(undo(history).present).toBe(a);
  });

  it('steps forward again to what was undone', () => {
    const stepped = undo(record(newHistory(a), b));
    expect(canRedo(stepped)).toBe(true);
    expect(redo(stepped).present).toBe(b);
  });

  /** Editing after stepping back forgets the branch that was stepped away from. */
  it('drops what was undone once something else is done instead', () => {
    const edited = record(undo(record(newHistory(a), b)), c);
    expect(edited.present).toBe(c);
    expect(canRedo(edited)).toBe(false);
    expect(undo(edited).present).toBe(a);
  });

  it('stays where it is at either end, rather than falling off', () => {
    const history = newHistory(a);
    expect(undo(history)).toBe(history);
    expect(redo(history)).toBe(history);
  });

  it('records nothing for a change that changed nothing', () => {
    const history = newHistory(a);
    expect(record(history, a)).toBe(history);
  });

  /**
   * A drag is hundreds of small moves, and a history with one step for each of
   * them is one nobody can get back out of. A change marked as continuing the
   * one before it replaces that step rather than adding to it.
   */
  it('folds a run of the same change into one step', () => {
    const dragging = record(record(newHistory(a), b, 'move'), c, 'move');
    expect(dragging.present).toBe(c);
    expect(undo(dragging).present).toBe(a);
  });

  it('starts a new step once the change is a different one', () => {
    const after = record(record(record(newHistory(a), b, 'move'), c, 'move'), a, 'colour');
    expect(undo(after).present).toBe(c);
  });

  /** The history is bounded, so a long session cannot grow without end. */
  it('forgets the oldest steps once it is full', () => {
    let history = newHistory({ background: '0', layers: [] });
    for (let step = 1; step <= 120; step += 1) {
      history = record(history, { background: String(step), layers: [] });
    }
    expect(history.past.length).toBeLessThanOrEqual(100);
    expect(history.present.background).toBe('120');
  });
});
