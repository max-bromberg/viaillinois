<script>
  import { Pad } from '../Pad/index.js';
  import { Icon } from '../Icon/index.js';
  import { Button } from '../Button/index.js';
  import { Highlight } from '../Highlight/index.js';
  import { organizationColors } from '../../../organizationColor.js';
  import { tagHue } from '../../../tagHue.js';
  import { campusDate, campusTime, toInstant } from '../../../campusTime.js';

  /**
   * The event page.
   *
   * A poster. The organization's light falls across the whole top of it at the
   * poster strength, the title is set at poster size with a seventeen character
   * measure, and the actions sit down the right with no box around them. The
   * board's tools appear only for a signed in board member of that organization.
   *
   * See docs/design/07-components.md and docs/design/08-surfaces.md.
   */
  let {
    /** The event, as the platform sends it. */
    event,
    /** Which theme the page is in, which decides how the colour is adapted. */
    theme = 'light',
    /** The address of this page, which is what somebody copies or scans. */
    url = null,
    /** Whether the reader is on this organization's board. */
    onBoard = false,
    /** Whether the room may be shown, which an internal event decides. */
    showRoom = true,
    /** What happens when a link is followed. */
    onnavigate = undefined,
    /**
     * What each action does. An action with no handler is not drawn at all: a
     * control that quietly does nothing is worse than one that is not there.
     */
    onaddToCalendar = undefined,
    ondownloadCalendarFile = undefined,
    oncopyLink = undefined,
    ondownloadCode = undefined,
    onmakePoster = undefined,
    onedit = undefined,
    oncancelEvent = undefined,
    class: className = '',
    /** The code that carries the link, drawn by the caller. */
    code,
    /**
     * The description. Organizers write it in markdown and the page renders it,
     * so the poster takes it as a snippet rather than as text, and falls back to
     * the event's own plain paragraphs when it is given none.
     */
    describe,
    /** Anything else the page knows and the poster has no place for. */
    aside: extra,
    /** What the board can do, beyond editing and cancelling. */
    boardActions,
    ...rest
  } = $props();

  /** Whether anything in the "take it with you" block has somewhere to go. */
  const takeable = $derived(Boolean(onaddToCalendar || ondownloadCalendarFile));
  const shareable = $derived(Boolean(url && (oncopyLink || ondownloadCode || onmakePoster)));

  const colors = $derived(organizationColors(event.rso_color, theme));
  const cancelled = $derived(Boolean(event.cancelled_at));

  const start = $derived(toInstant(event.start_time));
  const shown = $derived(start ? campusTime(start).split(' ') : []);
  const day = $derived(start ? campusDate(start, { weekday: 'long', month: 'long', day: 'numeric' }) : '');
  const ends = $derived(event.end_time ? campusTime(event.end_time) : '');

  const tags = $derived(
    event.tags ? String(event.tags).split(',').map(tag => tag.trim()).filter(Boolean) : [],
  );

  const room = $derived(
    event.building && event.room_number ? `${event.building} ${event.room_number}` : event.building ?? '',
  );

  const paragraphs = $derived(
    event.description ? String(event.description).split(/\n{2,}/).map(part => part.trim()).filter(Boolean) : [],
  );

  function back(clicked) {
    if (!onnavigate) return;
    clicked.preventDefault();
    onnavigate('/');
  }
</script>

<article
  class={['poster', className].filter(Boolean).join(' ')}
  style="--h: {colors.lamp}; --org-text: {colors.text}; --lamp: var(--lamp-poster)"
  {...rest}
>
  <div class="body2">
    <div>
      <a class="back" href="/" onclick={back}><Icon name="back" />All events</a>
      <h1>{event.title}</h1>
      <div class="org" style="--h: {colors.mark}; --org-text: {colors.text}">
        <Pad tone={colors.mark} />
        <b>{event.rso_name}</b>
        {#if event.rso_full_name}<span>{event.rso_full_name}</span>{/if}
      </div>
      <div class="when">
        <div>
          <div class="k">{day}</div>
          <div class="big">
            {#if start}
              <time datetime={start.toISOString()}>{shown[0]}</time>{#if ends}<small>to {ends}</small>{/if}
            {/if}
          </div>
        </div>
        {#if showRoom && room}
          <div>
            <div class="k">Room</div>
            <div class="room">{room}{#if event.building_name}<small>{event.building_name}</small>{/if}</div>
          </div>
        {/if}
      </div>
      {#if cancelled}
        <p class="said"><Highlight tone="var(--danger)" class="st">Cancelled</Highlight></p>
      {/if}
      {#if tags.length > 0}
        <div class="hlrow tags">
          {#each tags as tag (tag)}<Highlight tone={tagHue(tag)}>{tag}</Highlight>{/each}
        </div>
      {/if}
      {#if describe}
        <div class="txt">{@render describe()}</div>
      {:else if paragraphs.length > 0}
        <div class="txt">{#each paragraphs as paragraph, at (at)}<p>{paragraph}</p>{/each}</div>
      {/if}
      {@render extra?.()}
    </div>
    <aside>
      {#if takeable}
        <div>
          <h2>Take it with you</h2>
          <div class="stack">
            {#if onaddToCalendar}
              <Button variant="primary" icon="cal" onclick={onaddToCalendar}>Add to Google Calendar</Button>
            {/if}
            {#if ondownloadCalendarFile}
              <Button variant="secondary" onclick={ondownloadCalendarFile}>Download .ics</Button>
            {/if}
          </div>
        </div>
      {/if}
      {#if shareable}
        <div>
          <h2>Share</h2>
          <div class="link">{url}</div>
          <div class="share">
            {@render code?.()}
            <div class="stack">
              {#if oncopyLink}<Button variant="quiet" onclick={oncopyLink}>Copy link</Button>{/if}
              {#if ondownloadCode}<Button variant="quiet" onclick={ondownloadCode}>Download the QR code</Button>{/if}
              {#if onmakePoster}<Button variant="quiet" onclick={onmakePoster}>Make a poster</Button>{/if}
            </div>
          </div>
        </div>
      {/if}
      {#if onBoard}
        <div class="board cut" style="--cut: 14px">
          <h2>You are on the {event.rso_name} board</h2>
          <div class="row">
            {#if onedit}<Button variant="secondary" size="sm" on="card" onclick={onedit}>Edit</Button>{/if}
            {#if oncancelEvent}
              <Button variant="danger" size="sm" on="card" onclick={oncancelEvent}>Cancel event</Button>
            {/if}
            {@render boardActions?.()}
          </div>
        </div>
      {/if}
    </aside>
  </div>
</article>

<style>
  .back {
    color: inherit;
    text-decoration: none;
  }

  .back:hover {
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .back:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 4px;
  }

  /* The cancelled word sits on its own line, above the tags. */
  .said {
    margin-top: 18px;
  }

  /* The board panel's heading sits closer to its buttons than a page heading. */
  .board h2 {
    margin-bottom: 8px;
  }

  .row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
  }
</style>
