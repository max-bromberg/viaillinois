import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { Field } from '../../../src/lib/components/ui/Field/index.js';

/**
 * There is no box around a field. It is a label, then a line: a pad, the input,
 * and a rule under them. The pad and the rule carry the state, which is the same
 * shape and the same three colours the rest of the site uses.
 */
describe('Field', () => {
  it('is a label, a pad, an input and a rule, with no box around it', () => {
    const { container } = render(Field, { label: 'Event title', id: 'title' });
    const field = container.querySelector('.fld');
    expect(field.querySelector('label').textContent).toContain('Event title');
    expect(field.querySelector('.in .pad')).toBeTruthy();
    expect(field.querySelector('input')).toBeTruthy();
  });

  it('joins the label to the input, so that pressing the label reaches it', () => {
    const { container } = render(Field, { label: 'Event title', id: 'title' });
    expect(container.querySelector('label').getAttribute('for')).toBe('title');
    expect(container.querySelector('input').getAttribute('id')).toBe('title');
  });

  it('names the input for a screen reader even where it is given no id', () => {
    const { container } = render(Field, { label: 'Room' });
    const input = container.querySelector('input');
    expect(container.querySelector('label').getAttribute('for')).toBe(input.getAttribute('id'));
    expect(input.getAttribute('id')).toBeTruthy();
  });

  it('shows its help text, and ties it to the input', () => {
    const { container } = render(Field, { label: 'Room', help: 'The building code and the room number.' });
    const help = container.querySelector('.help');
    expect(help.textContent).toBe('The building code and the room number.');
    expect(container.querySelector('input').getAttribute('aria-describedby')).toBe(help.getAttribute('id'));
  });

  it('turns the line and the pad to the focus colour while somebody is typing', async () => {
    const { container } = render(Field, { label: 'Room' });
    const field = container.querySelector('.fld');
    expect(field.classList.contains('focus')).toBe(false);
    await fireEvent.focusIn(container.querySelector('input'));
    expect(field.classList.contains('focus')).toBe(true);
    await fireEvent.focusOut(container.querySelector('input'));
    expect(field.classList.contains('focus')).toBe(false);
  });

  /**
   * An error is a sentence in danger text under the thing that failed, never a
   * red box, and it says so in words as well as in colour.
   */
  it('says what is wrong in words, in place of the help text', () => {
    const { container } = render(Field, { label: 'Room', help: 'Where it is.', error: 'Enter a room number.' });
    const field = container.querySelector('.fld');
    expect(field.classList.contains('err')).toBe(true);
    expect(field.querySelector('.help').textContent).toBe('Enter a room number.');
    expect(container.querySelector('input').getAttribute('aria-invalid')).toBe('true');
  });

  it('carries the value it is given and reports what is typed', async () => {
    const { container } = render(Field, { label: 'Room', value: 'ECEB 1002' });
    const input = container.querySelector('input');
    expect(input.value).toBe('ECEB 1002');
    await fireEvent.input(input, { target: { value: 'ECEB 2070' } });
    expect(input.value).toBe('ECEB 2070');
  });

  it('takes the kind of input it is given', () => {
    const { container } = render(Field, { label: 'Starts', type: 'datetime-local' });
    expect(container.querySelector('input').getAttribute('type')).toBe('datetime-local');
  });

  it('can keep its name for a screen reader while drawing no label', () => {
    const { container } = render(Field, { label: 'Search the agenda', labelHidden: true });
    const label = container.querySelector('label');
    expect(label.classList.contains('hidden')).toBe(true);
    // Out of sight and still spoken: the input keeps its name.
    expect(label.getAttribute('for')).toBe(container.querySelector('input').getAttribute('id'));
  });

  it('says it is required both in the label and to a screen reader', () => {
    const { container } = render(Field, { label: 'Event title', required: true });
    expect(container.querySelector('input').required).toBe(true);
    expect(container.querySelector('label').textContent).toContain('required');
  });
});
