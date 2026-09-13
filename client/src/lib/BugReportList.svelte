<script>
  import { onMount } from 'svelte';
  import { getBugReports, setBugReportStatus } from '../api/bugReports.js';
  import { showToast } from '../stores/ui.js';
  import { campusDateTime } from './campusTime.js';
  import { Button, Highlight, EmptyState } from './components/ui/index.js';

  /**
   * What people have reported.
   *
   * Kept here rather than sent to a spreadsheet directly, so that no student's
   * report leaves the platform on its way to being read, and offered as a
   * spreadsheet file for whoever is tracking this work in one.
   *
   * The listing is built the way the exam listing is: rows told apart by
   * hairlines, with no card and no shadow under them. A status is a highlighter
   * rather than a filled pill, and the filter is a highlighter that says
   * whether it is on.
   */
  let reports = $state([]);
  let loading = $state(false);
  let openOnly = $state(false);

  const shown = $derived(openOnly ? reports.filter(r => r.status === 'Open') : reports);
  const openCount = $derived(reports.filter(r => r.status === 'Open').length);

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

<section class="reports">
  <div class="head">
    <div>
      <h2>Bug reports</h2>
      <p>
        What people have reported through the form on the About page.
        {openCount} of {reports.length} {reports.length === 1 ? 'is' : 'are'} still open.
      </p>
    </div>
    <div class="tools">
      <Highlight pressed={openOnly} onclick={() => { openOnly = !openOnly; }}>Open only</Highlight>
      <Button type="button" variant="secondary" size="sm" onclick={downloadCsv}>Download as CSV</Button>
    </div>
  </div>

  {#if loading && reports.length === 0}
    <p class="say">Reading the reports.</p>
  {:else if shown.length === 0}
    <EmptyState
      lead={openOnly ? 'Nothing is open.' : 'Nobody has reported anything yet.'}
      say={openOnly
        ? 'That is the reading you want. Turn the filter off to read the ones that have been dealt with.'
        : 'The form on the About page is where a report arrives from, and anybody can send one without signing in.'}
    />
  {:else}
    <ul>
      {#each shown as report (report.report_id)}
        <li>
          <div class="row">
            <div class="what">
              <p class="title">{report.summary}</p>
              <p class="meta mono">
                {report.area} · {campusDateTime(report.created_at)}
                {#if report.page} · {report.page}{/if}
                {#if report.reported_by} · {report.reported_by}{/if}
              </p>
            </div>
            <div class="state">
              <Highlight tone={report.status === 'Open' ? 'var(--primary)' : 'var(--muted)'} off={report.status !== 'Open'}>
                {report.status}
              </Highlight>
              {#if report.status === 'Open'}
                <Button type="button" variant="secondary" size="sm" onclick={() => setStatus(report.report_id, 'Closed')}>
                  Close report {report.report_id}
                </Button>
              {:else}
                <Button type="button" variant="secondary" size="sm" onclick={() => setStatus(report.report_id, 'Open')}>
                  Reopen report {report.report_id}
                </Button>
              {/if}
            </div>
          </div>
          {#if report.detail}
            <p class="detail">{report.detail}</p>
          {/if}
          {#if report.contact}
            <p class="meta">Reply to: {report.contact}</p>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .reports {
    display: grid;
    gap: 18px;
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: flex-start;
    justify-content: space-between;
  }

  h2 {
    font-family: var(--display);
    font-stretch: 75%;
    font-variation-settings: "opsz" 96;
    font-weight: 800;
    font-size: 22px;
    line-height: 1;
    color: var(--ink);
    margin: 0;
  }

  .head p {
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--muted);
    margin: 8px 0 0;
    max-width: 58ch;
  }

  .tools {
    display: flex;
    align-items: center;
    gap: 18px;
  }

  /* A tag or a status sits inside a 32 px target, filter or not. */
  .tools :global(.hl) {
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    cursor: pointer;
  }

  .tools :global(.hl:focus-visible) {
    outline: 2px solid var(--primary);
    outline-offset: 4px;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    padding: 14px 0;
    border-top: 1px solid var(--line);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: flex-start;
    justify-content: space-between;
  }

  .what {
    min-width: 0;
  }

  .title {
    font-family: var(--display);
    font-stretch: 90%;
    font-variation-settings: "opsz" 96;
    font-weight: 700;
    font-size: 16px;
    line-height: 1.15;
    color: var(--ink);
    margin: 0;
  }

  .meta {
    font-size: 12.5px;
    color: var(--muted);
    margin: 6px 0 0;
  }

  .state {
    display: flex;
    align-items: center;
    gap: 14px;
    flex: none;
  }

  .detail {
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--ink-2);
    white-space: pre-wrap;
    margin: 8px 0 0;
    max-width: 62ch;
  }

  .say {
    font-size: 13.5px;
    color: var(--muted);
    margin: 0;
  }
</style>
