<script>
  import { Pad } from '../Pad/index.js';
  import { Icon } from '../Icon/index.js';
  import { Highlight } from '../Highlight/index.js';
  import { organizationColors } from '../../../organizationColor.js';
  import { tagHue } from '../../../tagHue.js';
  import { campusTime, toInstant } from '../../../campusTime.js';
  import { locationLabel } from '../../../locationLabel.js';

  /**
   * A row in the agenda.
   *
   * A three column grid: the time, the event, and its status. The time is the
   * largest thing on the row, because the site exists to answer what is on and
   * when, and a layout that makes a person open each item to learn when it
   * happens has failed at the one job. The organization lights the row from its
   * top left corner, which is what replaced the stripe down the edge of a card.
   *
   * The organization's colour is adapted before it is drawn, never shown as it
   * was given: the lamp, the pad and the name each take their own role from
   * client/src/lib/organizationColor.js.
   *
   * See docs/design/07-components.md.
   */
  let {
    /** The event, as the platform sends it. */
    event,
    /** Whether it is happening right now. */
    live = false,
    /** Which theme the page is in, which decides how the colour is adapted. */
    theme = 'light',
    /** Whether the room may be shown, which an internal event decides. */
    showRoom = true,
    /** What happens when the row is followed, so the client can route it. */
    onnavigate = undefined,
    class: className = '',
    ...rest
  } = $props();

  const cancelled = $derived(Boolean(event.cancelled_at));
  const colors = $derived(organizationColors(event.rso_color, theme));

  const start = $derived(toInstant(event.start_time));
  const shown = $derived(start ? campusTime(start).split(' ') : []);
  const ends = $derived(event.end_time ? campusTime(event.end_time) : '');

  const tags = $derived(
    cancelled || !event.tags ? [] : String(event.tags).split(',').map(tag => tag.trim()).filter(Boolean),
  );

  /**
   * A location takes one of three forms: a room the platform knows about, free
   * text the organizer typed for somewhere that is not a room, or nothing at all
   * because it has not been decided. locationLabel knows all three, and reading
   * only the first of them lost the other two off the feed.
   */
  const room = $derived(locationLabel(event));

  /**
   * A live row is lit in signal, because what is happening now is the one thing
   * the signal colour is for, so the organization's own colour moves aside into
   * --org and keeps the name and the pad.
   */
  const style = $derived(
    [
      '--cut: 14px',
      live ? `--org: ${colors.lamp}` : `--h: ${colors.lamp}`,
      `--org-text: ${colors.text}`,
    ].join('; '),
  );

  function follow(event_) {
    if (!onnavigate) return;
    event_.preventDefault();
    onnavigate(`/events/${event.event_id}`);
  }
</script>

<article
  class={['ev', 'cut', 'reactive', live && 'now', cancelled && 'cancel', className].filter(Boolean).join(' ')}
  {style}
  {...rest}
>
  <div class="t">
    {#if start}
      <time datetime={start.toISOString()}>{shown[0]}{#if shown[1]}<small>{shown[1]}</small>{/if}</time>
      {#if ends}<em>to {ends}</em>{/if}
    {/if}
  </div>
  <div class="b">
    <div class="title">
      <a href="/events/{event.event_id}" onclick={follow}>{event.title}</a>
    </div>
    <div class="meta">
      <span class="org" style="--h: {colors.mark}; --org-text: {colors.text}">
        <Pad tone={colors.mark} hollow={cancelled} />{event.rso_name}
      </span>
      {#if showRoom && room}
        <span class="room"><Icon name="pin" />{room}</span>
      {/if}
    </div>
    {#if !cancelled && event.description}
      <div class="desc">{event.description}</div>
    {/if}
    {#if tags.length > 0}
      <div class="tags">
        {#each tags as tag (tag)}<Highlight tone={tagHue(tag)}>{tag}</Highlight>{/each}
      </div>
    {/if}
  </div>
  <!--
    Cancelled, happening now and internal are three different facts and an event
    can be more than one of them at once. Read as one chain, a cancelled internal
    event said only that it was cancelled.
  -->
  <div class="s">
    {#if cancelled}
      <Highlight tone="var(--danger)" class="st">Cancelled</Highlight>
    {:else if live}
      <span class="nowtag"><Pad tone="var(--signal)" breathing />Happening now</span>
    {/if}
    {#if event.is_private}
      <Highlight tone="var(--primary)" class="st">Internal</Highlight>
    {/if}
  </div>
</article>

<style>
  /*
   * The lamp is the row's own background, set by the .ev rule copied from the
   * reference stylesheet. Raised elevation brightens it and does nothing else:
   * the row does not lift and it gains no shadow.
   */
  .ev.reactive:hover,
  .ev.reactive:focus-within {
    --lamp: var(--lamp-hover);
  }

  .title a {
    color: inherit;
    text-decoration: none;
  }

  .title a:hover {
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .title a:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 4px;
  }
</style>
