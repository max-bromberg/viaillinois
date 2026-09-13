import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import LinkDiscordDone from '../../src/routes/LinkDiscordDone.svelte';

/**
 * Where somebody lands once the link is made. It says what is true now and how
 * to undo it, which is the whole of what a person needs here.
 */
describe('the page at the end of the Discord link', () => {
  it('says the link was made, as a filled pad and a sentence', () => {
    const { container, getByRole } = render(LinkDiscordDone);
    expect(getByRole('heading', { name: 'Your Discord account is linked', level: 1 })).toBeTruthy();
    const said = container.querySelector('.state');
    expect(said.querySelector('.pad')).toBeTruthy();
    expect(said.textContent).toMatch(/go back to Discord/i);
  });

  it('says how to undo it, from either side', () => {
    const { container, getByRole } = render(LinkDiscordDone);
    expect(getByRole('link', { name: /account page/i }).getAttribute('href')).toBe('/account');
    expect(container.textContent).toMatch(/unlink command/i);
  });
});
