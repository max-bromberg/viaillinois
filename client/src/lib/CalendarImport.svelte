<script>
  import { createEventDispatcher } from 'svelte';
  import { importCalendar } from '../api/calendar.js';
  import { Button, Icon } from './components/ui/index.js';
  import { campusDateTime } from './campusTime.js';
  import { repeatSummary } from './recurrenceLabel.js';

  /**
   * Importing a term from a calendar file.
   *
   * A heading, a sentence, the file, and then what the file would do, read as
   * rows with a hairline above each rather than as a boxed list. Nothing is
   * written until somebody has looked at the preview and said so.
   *
   * Both buttons here are secondary. The panel opens inside the logistics
   * dashboard, the midterm schedule and the admin page, each of which has its
   * own primary button, and there is one primary button per screen. See
   * docs/design/07-components.md.
   */

  /** Which listing to import into. */
  export let kind = 'events';
  /** Required when importing events. */
  export let rsoId = undefined;

  const dispatch = createEventDispatcher();

  let ics = '';
  let plan = null;
  let result = null;
  let error = null;
  let busy = false;

  const formatted = start => campusDateTime(start, { separator: ', ' });

  async function readFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    ics = await file.text();
    plan = null;
    result = null;
  }

  async function preview() {
    if (!ics.trim()) return;
    busy = true;
    error = null;
    result = null;
    try {
      plan = await importCalendar({ kind, rsoId, ics, preview: true });
    } catch (e) {
      error = e.message;
      plan = null;
    } finally {
      busy = false;
    }
  }

  async function confirm() {
    busy = true;
    error = null;
    try {
      result = await importCalendar({ kind, rsoId, ics, preview: false });
      plan = null;
      // The listing behind this panel is stale the moment this succeeds.
      dispatch('imported', result);
    } catch (e) {
      error = e.message;
    } finally {
      busy = false;
    }
  }
</script>

<div class="import">
  <h3>Import from a calendar file</h3>
  <p class="lede">
    Export an .ics file from Google Calendar, Outlook or Apple Calendar and load it here.
    Nothing is saved until you have looked at the preview.
  </p>

  <div class="file">
    <label for="ics-text">Calendar file</label>
    <input type="file" accept=".ics,text/calendar" on:change={readFile} />
    <textarea
      id="ics-text"
      class="mono"
      bind:value={ics}
      rows="4"
      placeholder="or paste the contents of the .ics file here"
    ></textarea>
  </div>

  <Button variant="secondary" size="sm" onclick={preview} disabled={busy}>
    {busy ? 'Reading' : 'Preview'}
  </Button>

  {#if error}
    <p class="failed">{error}</p>
  {/if}

  {#if result}
    <p class="said">
      {result.created} added, {result.updated} updated{result.skipped ? `, ${result.skipped} skipped` : ''}.
    </p>
  {/if}

  {#if plan}
    {#if plan.entries.length}
      <ul class="entries">
        {#each plan.entries as entry}
          <li>
            <div class="line">
              <span class="name">{entry.title}</span>
              <span class="does">
                {entry.action === 'update' ? 'updates an existing entry' : 'new'}
              </span>
            </div>
            <p class="note">{formatted(entry.start)}</p>
            {#if entry.kind === 'series'}
              <p class="note repeat">
                {repeatSummary({
                  interval_weeks: entry.recurrence.interval_weeks,
                  days_of_week: String(entry.recurrence.days_of_week).split(','),
                  ends_on: entry.recurrence.ends_on,
                })}, {entry.occurrences} events
              </p>
              {#if entry.action === 'update'}
                <p class="note">
                  {entry.creating} added, {entry.updating} updated{entry.removing ? `, ${entry.removing} removed` : ''}
                </p>
              {/if}
            {:else if entry.repeats === 'not expanded'}
              <p class="note">
                Repeats on a rule VIA does not expand, so only this one is imported.
              </p>
            {/if}
            {#if entry.location_match}
              <p class="note room"><Icon name="pin" />{entry.location_match}</p>
            {:else if entry.location_text}
              <p class="note room"><Icon name="pin" />{entry.location_text} (kept as written)</p>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="note">Nothing in that file can be imported.</p>
    {/if}

    {#if plan.skipped}
      <p class="note">
        {plan.skipped} {plan.skipped === 1 ? 'entry could not be read' : 'entries could not be read'},
        because they have no title or no start time.
      </p>
    {/if}

    {#if plan.notExpanded}
      <p class="note">
        {plan.notExpanded}
        {plan.notExpanded === 1 ? 'repeating entry uses a rule VIA does not expand' : 'repeating entries use rules VIA does not expand'},
        such as a monthly one. The first occurrence of each is imported.
      </p>
    {/if}

    {#if plan.duplicates}
      <p class="note">
        {plan.duplicates}
        {plan.duplicates === 1 ? 'entry appears more than once' : 'entries appear more than once'}
        in that file. The first of each was kept.
      </p>
    {/if}

    {#if plan.unmatched?.length}
      <div class="note">
        <p>These name no course VIA knows about, so they were left out:</p>
        <ul class="unmatched">
          {#each plan.unmatched as title}<li>{title}</li>{/each}
        </ul>
      </div>
    {/if}

    {#if plan.entries.length}
      <Button variant="secondary" size="sm" onclick={confirm} disabled={busy}>
        Import {plan.entries.length} {plan.entries.length === 1 ? 'entry' : 'entries'}
      </Button>
    {/if}
  {/if}
</div>

<style>
  /* No box around the panel. It is a heading, a sentence and what follows. */
  .import {
    display: grid;
    gap: 14px;
    justify-items: start;
  }

  h3 {
    font-family: var(--display);
    font-stretch: 75%;
    font-variation-settings: "opsz" 96;
    font-weight: 800;
    font-size: 22px;
    line-height: 1;
    margin: 0;
  }

  .lede {
    color: var(--ink-2);
    font-size: 14px;
    margin: 0;
    max-width: 62ch;
  }

  .file {
    display: grid;
    gap: 8px;
    width: 100%;
    max-width: 62ch;
  }

  label {
    font-family: var(--display);
    font-stretch: 80%;
    font-weight: 700;
    font-size: 14px;
  }

  input[type="file"] {
    font: inherit;
    font-size: 13px;
    color: var(--ink-2);
  }

  input[type="file"]:focus-visible,
  textarea:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 4px;
  }

  /* The field's own line, carried down the whole box rather than under one row. */
  textarea {
    font-family: var(--mono);
    font-size: 13px;
    color: var(--ink);
    background: var(--well);
    border: 0;
    border-bottom: 2px solid var(--line-strong);
    padding: 10px 12px;
    resize: vertical;
    width: 100%;
  }

  textarea:focus {
    border-bottom-color: var(--primary);
  }

  /* An error is a sentence under the thing that failed, never a red box. */
  .failed {
    color: var(--danger);
    font-size: 14px;
    margin: 0;
  }

  .said {
    font-size: 14px;
    margin: 0;
  }

  .entries {
    list-style: none;
    margin: 0;
    padding: 0;
    width: 100%;
    max-width: 62ch;
    max-height: 320px;
    overflow-y: auto;
  }

  .entries > li {
    padding: 12px 0;
    border-top: 1px solid var(--line);
  }

  .line {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  .name {
    font-family: var(--display);
    font-stretch: 90%;
    font-weight: 700;
    font-size: 15px;
  }

  .does {
    font-size: 12.5px;
    color: var(--muted);
  }

  .note {
    font-size: 12.5px;
    color: var(--muted);
    margin: 4px 0 0;
  }

  .note.repeat {
    color: var(--primary);
  }

  /* An icon never appears without a label; the room is the label beside it. */
  .room {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--mono);
    color: var(--ink-2);
  }

  .unmatched {
    margin: 4px 0 0;
    padding-left: 18px;
  }
</style>
