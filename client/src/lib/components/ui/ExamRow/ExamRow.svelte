<script>
  import { Highlight } from '../Highlight/index.js';
  import { campusShortDate, campusTime, toInstant } from '../../../campusTime.js';

  /**
   * An exam row.
   *
   * One exam set as a line in a printed listing on five columns: the course code
   * as the headline with the course title under it, the name of the exam, the
   * date and time as a number with the length of the exam under it, the room in
   * mono, and the status as a highlighted word. There is no card, no filled pill
   * and no coloured bar, which is what keeps a page of exams reading as a
   * schedule rather than as a feed.
   *
   * See docs/design/07-components.md and docs/design/08-surfaces.md.
   */
  let {
    /**
     * The exam, as the platform stores it: course_code, course_title, title,
     * start_time, end_time, status, and either building and room_number or a
     * room written as one piece of text.
     */
    exam,
    class: className = '',
    ...rest
  } = $props();

  /** The three statuses a midterm can hold, each in the colour it is read in. */
  const TONES = {
    Confirmed: 'var(--ok)',
    Pending: 'var(--warn)',
    Cancelled: 'var(--danger)',
  };

  /**
   * The platform stores a course code as it was submitted, and rows arrive with
   * the space missing or the letters in lower case. A column of codes only reads
   * as a column when every code is written the one way, "ECE 391".
   */
  const code = $derived(
    String(exam.course_code ?? '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .replace(/^([A-Z]+) ?(\d)/, '$1 $2')
      .trim(),
  );

  const startedAt = $derived(toInstant(exam.start_time));

  const when = $derived(
    startedAt ? `${campusShortDate(exam.start_time)}, ${campusTime(exam.start_time)}` : '',
  );

  const minutes = $derived.by(() => {
    const ended = toInstant(exam.end_time);
    if (!startedAt || !ended) return null;
    const span = Math.round((ended.getTime() - startedAt.getTime()) / 60000);
    return span > 0 ? span : null;
  });

  /**
   * Two hours reads better than a hundred and twenty minutes, and ninety minutes
   * reads better than an hour and a half, so a whole number of hours is given in
   * hours and everything else is given in minutes.
   */
  const howLong = $derived.by(() => {
    if (minutes === null) return null;
    if (minutes % 60 !== 0) return `${minutes} minutes`;
    const hours = minutes / 60;
    return hours === 1 ? '1 hour' : `${hours} hours`;
  });

  /**
   * A room that came in with the HKN import is free text and matches no room
   * record, so the row takes what it is given rather than showing a gap.
   */
  const room = $derived(exam.room ?? [exam.building, exam.room_number].filter(Boolean).join(' '));

  const tone = $derived(TONES[exam.status] ?? 'var(--primary)');
</script>

<div class={['exam', className].filter(Boolean).join(' ')} {...rest}>
  <div class="code">{code}<small>{exam.course_title ?? ''}</small></div>
  <div class="ttl">{exam.title ?? ''}</div>
  <div class="tm">
    <time datetime={startedAt ? startedAt.toISOString() : undefined}>{when}</time>
    {#if howLong}<small><time datetime="PT{minutes}M">{howLong}</time></small>{/if}
  </div>
  <div class="rm">{room}</div>
  <div><Highlight {tone} class="st">{exam.status}</Highlight></div>
</div>
