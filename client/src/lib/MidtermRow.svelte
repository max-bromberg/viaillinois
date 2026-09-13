<script>
  import { createEventDispatcher } from 'svelte';
  import { ExamRow, Pad, Button } from './components/ui/index.js';
  import { locationLabel } from './locationLabel.js';

  /**
   * One midterm on the schedule.
   *
   * The entry itself is the design system's exam row, set as a line in a printed
   * listing. The two things the listing adds for the people who keep it, the
   * tick that chooses entries to clear together and the delete control, sit on
   * either side of it, so the row reads the same for everybody and the controls
   * only appear for those who have them.
   *
   * See docs/design/07-components.md "Midterm parts".
   */
  export let midterm;
  /** Global admins and RSO board members may remove an entry from the schedule. */
  export let canDelete = false;
  /** Whether this entry is one of the ones chosen for removal together. */
  export let chosen = false;

  const dispatch = createEventDispatcher();

  let confirming = false;

  /**
   * A location is optional and takes three forms, and the exam row prints one
   * room, so what goes in it is the sentence the rest of the site writes for all
   * three.
   */
  $: exam = { ...midterm, room: locationLabel(midterm) };
</script>

<div class="mrow" class:manage={canDelete}>
  {#if canDelete}
    <label class="tick">
      <input
        type="checkbox"
        data-midterm-tick
        checked={chosen}
        aria-label="Choose {midterm.course_code} {midterm.title} for removal"
        on:change={e => dispatch('choose', { midterm_id: midterm.midterm_id, chosen: e.currentTarget.checked })}
      />
      <Pad hollow={!chosen} lit={chosen} />
    </label>
  {/if}

  <ExamRow {exam} />

  {#if canDelete}
    <div class="tools">
      {#if confirming}
        <Button
          variant="danger"
          size="sm"
          onclick={() => { confirming = false; dispatch('delete', { midterm_id: midterm.midterm_id }); }}
        >Yes, delete</Button>
        <Button variant="secondary" size="sm" onclick={() => confirming = false}>Cancel</Button>
      {:else}
        <Button variant="danger" size="sm" onclick={() => confirming = true}>Delete</Button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .mrow {
    display: grid;
  }

  /*
   * With the controls beside it the hairline belongs to the whole row rather
   * than to the exam alone, or the listing is ruled short of its own edge.
   */
  .mrow.manage {
    grid-template-columns: 32px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    border-top: 1px solid var(--line);
  }

  .mrow.manage :global(.exam) {
    border-top: 0;
  }

  .tick {
    position: relative;
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    cursor: pointer;
  }

  /*
   * The tick is a pad, and the checkbox under it is what the keyboard and the
   * screen reader answer. Left at zero size it would take no focus, so it keeps
   * the target's own size and its own transparency.
   */
  .tick input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .tick:focus-within {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .tools {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: flex-end;
    white-space: nowrap;
  }
</style>
