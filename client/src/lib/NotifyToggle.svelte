<script>
  import { onMount } from 'svelte';
  import { getMyNotifications, followOrganization, remindAboutEvent } from '../api/notifications.js';
  import { showToast } from '../stores/ui.js';

  /**
   * Choosing to hear about an organization, or about one event.
   *
   * Both of these belong to the Discord bot, because the bot is what sends the
   * message, and both were reachable only by typing a command in Discord. That
   * is the wrong moment: somebody decides they care about an organization
   * while they are reading about it, not later, somewhere else.
   *
   * The control says what it will do in terms of being told rather than in
   * terms of the bot, and it says what it already is, because a switch whose
   * state cannot be read is worse than no switch at all. Somebody who has not
   * linked a Discord account, or is not signed in, is offered the page that
   * explains how rather than a control that would refuse them.
   */

  let { kind, id, name = '' } = $props();

  let linked = $state(false);
  let on = $state(false);
  let ready = $state(false);
  let working = $state(false);

  const isEvent = $derived(kind === 'event');

  const label = $derived(
    isEvent
      ? (on ? 'Reminder set' : 'Remind me before this')
      : (on ? 'Following' : `Follow${name ? ` ${name}` : ''}`),
  );

  onMount(async () => {
    try {
      const mine = await getMyNotifications();
      linked = Boolean(mine.linked);
      on = isEvent
        ? (mine.reminders ?? []).includes(id)
        : (mine.following ?? []).includes(id);
    } catch {
      // Not signed in, or the website could not say. Either way the offer is
      // the page that explains how this works rather than a switch.
      linked = false;
    } finally {
      ready = true;
    }
  });

  async function toggle() {
    const wanted = !on;
    // Moved first, because a control that waits for the network before it
    // answers reads as a control that did not work.
    on = wanted;
    working = true;
    try {
      if (isEvent) await remindAboutEvent(id, wanted);
      else await followOrganization(id, wanted);
    } catch (err) {
      on = !wanted;
      showToast(err.message, 'error');
    } finally {
      working = false;
    }
  }
</script>

{#if !ready}
  <span class="notify placeholder" aria-hidden="true"></span>
{:else if linked}
  <button
    type="button"
    class="notify check"
    aria-pressed={on}
    disabled={working}
    onclick={toggle}
  >
    {label}
  </button>
{:else}
  <a class="notify offer" href="/notifications">
    {isEvent ? 'Get reminded before this' : 'Get notified about this organization'}
  </a>
{/if}

<style>
  .notify { font-size: 13.5px; }
  .notify.placeholder { display: inline-block; min-height: 1em; min-width: 8ch; }
  .notify.offer { color: var(--primary); }
</style>
