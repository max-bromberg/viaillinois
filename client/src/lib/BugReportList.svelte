<script>
  import { onMount } from 'svelte';
  import { getBugReports, setBugReportStatus } from '../api/bugReports.js';
  import { showToast } from '../stores/ui.js';
  import { campusDateTime } from './campusTime.js';
  import { Button } from '$lib/components/ui/button';

  /**
   * What people have reported.
   *
   * Kept here rather than sent to a spreadsheet directly, so that no student's
   * report leaves the platform on its way to being read, and offered as a
   * spreadsheet file for whoever is tracking this work in one.
   */
  let reports = [];
  let loading = false;
  let openOnly = false;

  $: shown = openOnly ? reports.filter(r => r.status === 'Open') : reports;
  $: openCount = reports.filter(r => r.status === 'Open').length;

  async function load() {
    loading = true;
    try {
      const { reports: rows } = await getBugReports();
      reports = rows ?? [];
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      loading = false;
    }
  }

  async function setStatus(reportId, status) {
    try {
      await setBugReportStatus(reportId, status);
      await load();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  /** One field of a row, quoted the way a spreadsheet reads it. */
  const cell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;

  const COLUMNS = ['report_id', 'created_at', 'status', 'area', 'summary', 'detail', 'page', 'reported_by', 'contact'];

  function downloadCsv() {
    const lines = [
      COLUMNS.join(','),
      ...shown.map(report => COLUMNS.map(column => cell(report[column])).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'via-bug-reports.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  onMount(load);
</script>

<div class="space-y-4">
  <section class="border rounded-lg p-5 bg-card shadow-sm space-y-4">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h2 class="text-base font-semibold">Bug reports</h2>
        <p class="text-sm text-muted-foreground">
          What people have reported through the form on the About page.
          {openCount} of {reports.length} {reports.length === 1 ? 'is' : 'are'} still open.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="px-3 py-1.5 text-xs border rounded-md transition-colors
            {openOnly ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent text-muted-foreground'}"
          on:click={() => openOnly = !openOnly}
        >Open only</button>
        <Button type="button" variant="outline" size="sm" on:click={downloadCsv}>Download as CSV</Button>
      </div>
    </div>

    {#if loading && reports.length === 0}
      <p class="text-sm text-muted-foreground">Loading the reports.</p>
    {:else if shown.length === 0}
      <p class="text-sm text-muted-foreground">
        {openOnly ? 'Nothing is open. That is the reading you want.' : 'Nobody has reported anything yet.'}
      </p>
    {:else}
      <ul class="border rounded-md divide-y">
        {#each shown as report (report.report_id)}
          <li class="px-4 py-3 space-y-1.5">
            <div class="flex items-start justify-between gap-4 flex-wrap">
              <div class="min-w-0 space-y-0.5">
                <p class="text-sm font-medium">{report.summary}</p>
                <p class="text-xs text-muted-foreground">
                  {report.area} · {campusDateTime(report.created_at)}
                  {#if report.page} · {report.page}{/if}
                  {#if report.reported_by} · {report.reported_by}{/if}
                </p>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <span class="text-xs px-1.5 py-0.5 rounded {report.status === 'Open' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}">{report.status}</span>
                {#if report.status === 'Open'}
                  <button
                    class="px-2.5 py-1 text-xs border border-input rounded-md hover:bg-accent transition-colors"
                    on:click={() => setStatus(report.report_id, 'Closed')}
                  >Close report {report.report_id}</button>
                {:else}
                  <button
                    class="px-2.5 py-1 text-xs border border-input rounded-md hover:bg-accent transition-colors"
                    on:click={() => setStatus(report.report_id, 'Open')}
                  >Reopen report {report.report_id}</button>
                {/if}
              </div>
            </div>
            {#if report.detail}
              <p class="text-sm text-muted-foreground whitespace-pre-wrap">{report.detail}</p>
            {/if}
            {#if report.contact}
              <p class="text-xs text-muted-foreground">Reply to: {report.contact}</p>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>
