<script>
  /**
   * The shape of an exam row while the schedule is on its way.
   *
   * Drawn in well colour with no shimmer, and standing in the same columns as
   * the row it is waiting for, so that nothing moves when the schedule arrives.
   * See docs/design/08-surfaces.md, "Empty, loading and error states".
   */

  /** Matches the columns the real row adds for those who may delete. */
  export let canDelete = false;
</script>

<div class="mrow" class:manage={canDelete} aria-hidden="true">
  {#if canDelete}<div class="block tick"></div>{/if}

  <div class="exam">
    <div class="block code"></div>
    <div class="block ttl"></div>
    <div class="block tm"></div>
    <div class="block rm"></div>
  </div>

  {#if canDelete}<div class="block tools"></div>{/if}
</div>

<style>
  .mrow {
    display: grid;
  }

  .mrow.manage {
    grid-template-columns: 32px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    border-top: 1px solid var(--line);
  }

  .mrow.manage .exam {
    border-top: 0;
  }

  /*
   * The same five column grid the exam row is set on, so the blocks stand where
   * the words will. The status column is left empty, because a highlighted word
   * has no shape of its own to draw.
   */
  .exam {
    display: grid;
    grid-template-columns: 150px 1fr 250px 130px 110px;
    gap: 20px;
    align-items: center;
    padding: 14px 0;
    border-top: 1px solid var(--line);
  }

  .block {
    background: var(--well);
  }

  .block.code  { height: 30px; }
  .block.ttl   { height: 16px; max-width: 160px; }
  .block.tm    { height: 22px; }
  .block.rm    { height: 14px; }
  .block.tick  { width: 12px; height: 12px; justify-self: center; }
  .block.tools { width: 64px; height: 28px; }
</style>
