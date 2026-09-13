<script>
  import { submitBugReport } from '../api/bugReports.js';
  import { Button, Field, Pad } from './components/ui/index.js';

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
   *
   * Every line is the design system's field: a label, a pad, the control and a
   * rule under it, with no box around any of it. The kinds of control the field
   * does not draw, which are the list and the long answer, are drawn here from
   * the same parts. See docs/design/07-components.md.
   */
  const AREAS = ['Events', 'Calendar', 'Midterms', 'Dashboard', 'Scheduler', 'Something else'];

  let area = $state('Something else');
  let summary = $state('');
  let detail = $state('');
  let contact = $state('');
  let page = $state(typeof window !== 'undefined' ? window.location.pathname : '');
  let sending = $state(false);
  let sent = $state(false);
  let error = $state(null);

  /** Which of the two hand drawn lines has the focus, so that it can say so. */
  let focused = $state(null);

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

<div class="report">
  <p>
    If something on VIA is wrong, broken, or just confusing, this is the fastest way to tell
    us. You do not have to be signed in, and the only things we need are which part of the
    site it was and one line about what happened.
  </p>

  {#if sent}
    <p class="done"><Pad lit /> Thank you. Your report is recorded, and somebody will look at it.</p>
    <div class="send">
      <Button type="button" variant="secondary" onclick={again}>Report something else</Button>
    </div>
  {:else}
    <form onsubmit={event => { event.preventDefault(); send(); }}>
      <!--
        The list and the long answer are the two controls the field component
        does not draw, so they are drawn here out of the same label, pad and
        rule, and they carry the same focus state.
      -->
      <div class="fld" class:focus={focused === 'area'}>
        <label for="bug-area">What is it about?</label>
        <div class="in">
          <Pad />
          <!--
            A native select with no background of its own is painted white by
            the browser, which is a white box in the middle of a dark page, and
            the colour has to be on the tag for the list of options to take it.
          -->
          <select
            id="bug-area"
            style="background: var(--paper)"
            bind:value={area}
            onfocusin={() => { focused = 'area'; }}
            onfocusout={() => { focused = null; }}
          >
            {#each AREAS as option (option)}
              <option value={option}>{option}</option>
            {/each}
          </select>
        </div>
      </div>

      <Field
        label="What went wrong?"
        id="bug-summary"
        class="wide"
        bind:value={summary}
        maxlength="200"
        placeholder="One line, such as: the calendar is missing the last week of the month"
        help="One line is enough. The detail below is optional."
      />

      <div class="fld wide tall" class:focus={focused === 'detail'}>
        <label for="bug-detail">Anything else that would help (optional)</label>
        <div class="in">
          <Pad />
          <textarea
            id="bug-detail"
            bind:value={detail}
            rows="4"
            maxlength="4000"
            placeholder="What you were doing, what you expected, and what happened instead."
            onfocusin={() => { focused = 'detail'; }}
            onfocusout={() => { focused = null; }}
          ></textarea>
        </div>
      </div>

      <div class="pair">
        <Field label="Which page (optional)" id="bug-page" bind:value={page} maxlength="500" />
        <!--
          Left as plain text rather than an email field: a reporter who leaves a
          Discord handle here should not have the form quietly refuse to send.
        -->
        <Field
          label="How to reach you (optional)"
          id="bug-contact"
          bind:value={contact}
          maxlength="255"
          placeholder="Your email, if you want a reply"
        />
      </div>

      {#if error}
        <p class="wrong">{error}</p>
      {/if}

      <div class="send">
        <Button type="submit" variant="primary" busy={sending} disabled={!summary.trim()}>
          {sending ? 'Sending' : 'Send report'}
        </Button>
      </div>
    </form>
  {/if}
</div>

<style>
  .report {
    margin-top: 20px;
  }

  .report > p {
    font-family: var(--sans);
    font-size: 15px;
    line-height: 1.55;
    color: var(--ink-2);
    max-width: 62ch;
    margin: 0;
  }

  form {
    margin-top: 28px;
    display: grid;
    gap: 22px;
    justify-items: start;
    max-width: 62ch;
  }

  /*
   * The fields a reader writes a sentence into run the width of the reading
   * measure rather than the 320 px a name or a room takes.
   */
  .report :global(.fld.wide) {
    max-width: 100%;
    width: 100%;
  }

  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 22px;
    width: 100%;
  }

  /* The list and the long answer take the same line the field's input takes. */
  .fld .in select,
  .fld .in textarea {
    font: inherit;
    font-size: 16px;
    border: 0;
    background: transparent;
    color: var(--ink);
    outline: 0;
    width: 100%;
  }

  .fld .in textarea {
    resize: vertical;
    padding: 0;
    line-height: 1.5;
  }

  /* A long answer starts at the top of its line, not halfway down it. */
  .fld.tall .in {
    align-items: flex-start;
  }

  .fld.tall .in :global(.pad) {
    margin-top: 7px;
  }

  .done {
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: var(--sans);
    font-size: 15px;
    line-height: 1.55;
    color: var(--ink);
    margin: 24px 0 0;
    max-width: 62ch;
  }

  .send {
    margin-top: 4px;
  }

  /* An error is a sentence under the thing that failed, never a red box. */
  .wrong {
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--danger);
    margin: 0;
    max-width: 62ch;
  }

  @media (max-width: 640px) {
    .pair {
      grid-template-columns: 1fr;
    }
  }
</style>
