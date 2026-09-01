<script>
  import { importCalendar } from '../api/calendar.js';
  import { Button } from '$lib/components/ui/button';
  import { Label } from '$lib/components/ui/label';

  /** Which listing to import into. */
  export let kind = 'events';
  /** Required when importing events. */
  export let rsoId = undefined;

  let ics = '';
  let plan = null;
  let result = null;
  let error = null;
  let busy = false;

  const formatted = (start) =>
    new Date(start.replace(' ', 'T')).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });

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
    } catch (e) {
      error = e.message;
    } finally {
      busy = false;
    }
  }
</script>

<div class="border rounded-lg p-4 space-y-4">
  <div class="space-y-1">
    <h3 class="font-semibold text-sm">Import from a calendar file</h3>
    <p class="text-xs text-muted-foreground">
      Export an .ics file from Google Calendar, Outlook or Apple Calendar and load it here.
      Nothing is saved until you have looked at the preview.
    </p>
  </div>

  <div class="space-y-1">
    <Label htmlFor="ics-text">Calendar file</Label>
    <input type="file" accept=".ics,text/calendar" on:change={readFile} class="text-xs" />
    <textarea
      id="ics-text"
      bind:value={ics}
      rows="4"
      placeholder="or paste the contents of the .ics file here"
      class="w-full rounded-md border bg-background px-3 py-2 text-xs font-mono"
    ></textarea>
  </div>

  <Button type="button" on:click={preview} disabled={busy}>
    {busy ? 'Reading...' : 'Preview'}
  </Button>

  {#if error}
    <p class="text-sm text-destructive">{error}</p>
  {/if}

  {#if result}
    <p class="text-sm">
      {result.created} added, {result.updated} updated{result.skipped ? `, ${result.skipped} skipped` : ''}.
    </p>
  {/if}

  {#if plan}
    {#if plan.entries.length}
      <ul class="border rounded-md divide-y text-sm max-h-72 overflow-y-auto">
        {#each plan.entries as entry}
          <li class="px-3 py-2">
            <div class="flex items-baseline justify-between gap-2">
              <span class="font-medium">{entry.title}</span>
              <span class="text-xs text-muted-foreground">
                {entry.action === 'update' ? 'updates an existing entry' : 'new'}
              </span>
            </div>
            <p class="text-xs text-muted-foreground">{formatted(entry.start)}</p>
            {#if entry.location_match}
              <p class="text-xs text-muted-foreground">📍 {entry.location_match}</p>
            {:else if entry.location_text}
              <p class="text-xs text-muted-foreground">📍 {entry.location_text} (kept as written)</p>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="text-sm text-muted-foreground">Nothing in that file can be imported.</p>
    {/if}

    {#if plan.skipped}
      <p class="text-xs text-muted-foreground">
        {plan.skipped} {plan.skipped === 1 ? 'entry could not be read' : 'entries could not be read'},
        because they have no title or no start time.
      </p>
    {/if}

    {#if plan.duplicates}
      <p class="text-xs text-muted-foreground">
        {plan.duplicates}
        {plan.duplicates === 1 ? 'entry appears more than once' : 'entries appear more than once'}
        in that file. The first of each was kept.
      </p>
    {/if}

    {#if plan.unmatched?.length}
      <div class="text-xs text-muted-foreground">
        <p>These name no course VIA knows about, so they were left out:</p>
        <ul class="list-disc list-inside">
          {#each plan.unmatched as title}<li>{title}</li>{/each}
        </ul>
      </div>
    {/if}

    {#if plan.entries.length}
      <Button type="button" on:click={confirm} disabled={busy}>
        Import {plan.entries.length} {plan.entries.length === 1 ? 'entry' : 'entries'}
      </Button>
    {/if}
  {/if}
</div>
