<script>
  import { onMount } from 'svelte';
  import { getMidterms, createMidterm, voteMidterm } from '../api/midterms.js';
  import MidtermRow from '../lib/MidtermRow.svelte';
  import MidtermRowSkeleton from '../lib/MidtermRowSkeleton.svelte';
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import { showToast } from '../stores/ui.js';
  import { currentUser } from '../stores/auth.js';

  let midterms = [];
  let loading = false;
  let courseFilter = '';
  let showForm = false;
  let userVotes = {}; // midterm_id -> vote value
  let filterDebounce;

  // Form state
  let form = { course_code: '', title: '', location_id: '', start_time: '', end_time: '' };

  async function load() {
    loading = true;
    try {
      const { midterms: m } = await getMidterms(courseFilter || null);
      midterms = m;
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      loading = false;
    }
  }

  async function handleVote(midtermId, value) {
    if (!$currentUser) { showToast('Sign in to vote', 'error'); return; }
    const previousVote = userVotes[midtermId] || 0;
    const snapshotMidterms = midterms;
    const snapshotVotes = userVotes;
    try {
      await voteMidterm(midtermId, value);
      midterms = midterms.map(m =>
        m.midterm_id === midtermId
          ? { ...m, score: (m.score || 0) + value - previousVote }
          : m
      );
      userVotes = { ...userVotes, [midtermId]: value };
    } catch (e) {
      midterms = snapshotMidterms;
      userVotes = snapshotVotes;
      showToast(e.message, 'error');
    }
  }

  async function handleSubmit() {
    loading = true;
    try {
      await createMidterm({ ...form, location_id: parseInt(form.location_id) });
      showToast('Midterm submitted — thanks!');
      showForm = false;
      form = { course_code: '', title: '', location_id: '', start_time: '', end_time: '' };
      await load();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      loading = false;
    }
  }

  onMount(load);
</script>

<svelte:head>
  <title>Midterms – VIA</title>
  <meta name="description" content="Community-sourced ECE midterm exam schedule at UIUC. Help RSO boards avoid scheduling conflicts during exam weeks." />
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold">Midterm Schedule</h1>
    <div class="flex gap-2">
      <Input placeholder="Filter by course…" bind:value={courseFilter} on:input={() => { clearTimeout(filterDebounce); filterDebounce = setTimeout(load, 300); }} class="w-44 h-9" />
      {#if $currentUser}
        <Button size="sm" on:click={() => showForm = !showForm}>+ Submit</Button>
      {/if}
    </div>
  </div>

  {#if showForm}
    <form on:submit|preventDefault={handleSubmit} class="border rounded-lg p-4 bg-card grid grid-cols-2 gap-3">
      <input placeholder="Course code (e.g. ECE 313)" bind:value={form.course_code} required class="col-span-2 border rounded px-3 py-1.5 text-sm bg-background" />
      <input placeholder="Title (e.g. Midterm 1)" bind:value={form.title} required class="col-span-2 border rounded px-3 py-1.5 text-sm bg-background" />
      <input placeholder="Location ID" type="number" bind:value={form.location_id} required class="border rounded px-3 py-1.5 text-sm bg-background" />
      <div></div>
      <input type="datetime-local" bind:value={form.start_time} required class="border rounded px-3 py-1.5 text-sm bg-background" />
      <input type="datetime-local" bind:value={form.end_time} required class="border rounded px-3 py-1.5 text-sm bg-background" />
      <Button type="submit" disabled={loading} class="col-span-2">{loading ? 'Submitting…' : 'Submit midterm'}</Button>
    </form>
  {/if}

  <div class="border rounded-lg overflow-hidden bg-card">
    <table class="w-full text-left">
      <thead class="bg-muted">
        <tr>
          <th class="py-2 px-4 text-xs font-semibold uppercase tracking-wide">Exam</th>
          <th class="py-2 px-4 text-xs font-semibold uppercase tracking-wide">Time</th>
          <th class="py-2 px-4 text-xs font-semibold uppercase tracking-wide">Location</th>
          <th class="py-2 px-4 text-xs font-semibold uppercase tracking-wide">Status</th>
          <th class="py-2 px-4 text-xs font-semibold uppercase tracking-wide">Votes</th>
        </tr>
      </thead>
      <tbody>
        {#if loading}
          {#each Array(5) as _}
            <MidtermRowSkeleton />
          {/each}
        {:else if midterms.length === 0}
          <tr><td colspan="5" class="py-8 text-center text-sm text-muted-foreground">No midterms found.</td></tr>
        {:else}
          {#each midterms as midterm (midterm.midterm_id)}
            <MidtermRow {midterm} userVote={userVotes[midterm.midterm_id]} on:vote={(e) => handleVote(midterm.midterm_id, e.detail)} />
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</div>
