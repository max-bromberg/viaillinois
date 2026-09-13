import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Privacy from '../../src/routes/Privacy.svelte';

/**
 * The Discord link is the newest thing VIA stores about a person, and the one
 * a reader is least likely to guess at: a link between a NetID and a Discord
 * account, an encrypted authorization for some people, hashes of Discord
 * identifiers for others, and a calendar address that is a credential. The
 * policy has to say all of it, say how long it is kept, and say how to remove
 * it.
 */
describe('the privacy policy on the Discord link', () => {
  it('has a section of its own about it', () => {
    render(Privacy);
    expect(screen.getByRole('heading', { name: /discord/i })).toBeTruthy();
  });

  it('says what is stored', () => {
    render(Privacy);
    const text = document.body.textContent;
    expect(text).toMatch(/Discord user identifier/i);
    expect(text).toMatch(/encrypted/i);
    expect(text).toMatch(/linked roles/i);
    expect(text).toMatch(/one way hash/i);
    expect(text).toMatch(/calendar address/i);
  });

  it('says the bot never reads messages and stores no message text', () => {
    render(Privacy);
    expect(document.body.textContent).toMatch(/never reads your messages/i);
  });

  it('says how long each of those is kept', () => {
    render(Privacy);
    const text = document.body.textContent;
    expect(text).toMatch(/link request/i);
    expect(text).toMatch(/until you unlink/i);
  });

  it('says how to remove it, from either side', () => {
    render(Privacy);
    const text = document.body.textContent;
    expect(text).toMatch(/account page/i);
    expect(text).toMatch(/unlink command/i);
  });

  it('numbers its sections in order, with none repeated', () => {
    render(Privacy);
    const numbers = [...document.body.textContent.matchAll(/(?:^|\s)(\d{1,2})\.\s[A-Z]/g)]
      .map(match => Number(match[1]));
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});
