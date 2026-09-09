<script>
  import { submitBugReport } from '../api/bugReports.js';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';

  /**
   * Reporting something broken.
   *
   * The only way to say that something was wrong with VIA was to write to the
   * address on the About page, and most people do not write an email about a
   * button. Nothing here is required except which part of VIA and one line
   * saying what happened, because a report nobody finishes is worth less than a
   * short one.
   *
   * The page the reporter was on is filled in for them. It is the most useful
   * thing on the form and the thing a reporter is least likely to think to say.
   */
  const AREAS = ['Events', 'Calendar', 'Midterms', 'Dashboard', 'Scheduler', 'Something else'];

  let area = 'Something else';
  let summary = '';
  let detail = '';
  let contact = '';
  let page = typeof window !== 'undefined' ? window.location.pathname : '';
  let sending = false;
  let sent = false;
  let error = null;

  async function send() {
    if (!summary.trim() || sending) return;
    sending = true;
    error = null;
    try {
      await submitBugReport({
        area,
        summary: summary.trim(),
        detail: detail.trim() || undefined,
        contact: contact.trim() || undefined,
        page: page.trim() || undefined,
      });
      sent = true;
    } catch (e) {
      error = e.message;
    } finally {
      sending = false;
    }
  }

  function again() {
    sent = false;
    summary = '';
    detail = '';
  }
</script>

<div class="space-y-4">
  <div class="space-y-2">
    <h1 class="text-2xl font-bold">Report a bug</h1>
    <p class="text-sm text-muted-foreground leading-relaxed">
      If something on VIA is wrong, broken, or just confusing, this is the fastest way to
      tell us. You do not have to be signed in, and the only things we need are which part
      of the site it was and one line about what happened.
    </p>
  </div>

  {#if sent}
    <div class="rounded-lg border bg-card p-5 space-y-3">
      <p class="text-sm">
        Thank you. Your report has been recorded and somebody will look at it.
      </p>
      <Button type="button" variant="outline" on:click={again}>Report something else</Button>
    </div>
  {:else}
    <form class="rounded-lg border bg-card p-5 space-y-4" on:submit|preventDefault={send}>
      <div class="space-y-1">
        <Label htmlFor="bug-area">What is it about?</Label>
        <select
          id="bug-area"
          bind:value={area}
          class="w-full border rounded-md px-3 py-2 text-sm bg-background"
        >
          {#each AREAS as option}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </div>

      <div class="space-y-1">
        <Label htmlFor="bug-summary">What went wrong?</Label>
        <Input
          id="bug-summary"
          bind:value={summary}
          maxlength="200"
          placeholder="One line, such as: the calendar is missing the last week of the month"
        />
      </div>

      <div class="space-y-1">
        <Label htmlFor="bug-detail">Anything else that would help (optional)</Label>
        <textarea
          id="bug-detail"
          bind:value={detail}
          rows="4"
          maxlength="4000"
          placeholder="What you were doing, what you expected, and what happened instead."
          class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
        ></textarea>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div class="space-y-1">
          <Label htmlFor="bug-page">Which page (optional)</Label>
          <Input id="bug-page" bind:value={page} maxlength="500" />
        </div>
        <div class="space-y-1">
          <Label htmlFor="bug-contact">How to reach you (optional)</Label>
          <Input id="bug-contact" bind:value={contact} maxlength="255" placeholder="Your email, if you want a reply" />
        </div>
      </div>

      {#if error}
        <p class="text-sm text-destructive">{error}</p>
      {/if}

      <Button type="submit" disabled={sending || !summary.trim()}>
        {sending ? 'Sending…' : 'Send report'}
      </Button>
    </form>
  {/if}
</div>
