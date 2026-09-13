<script>
  /**
   * The shape of a row, while it is on its way.
   *
   * docs/design/08-surfaces.md: loading draws the shape of the rows in well
   * colour with no shimmer, and the rows settle when they arrive. The shimmer
   * that used to run across these was motion with nothing to tell you, which is
   * the fastest way to make a page feel generated.
   */
</script>

<div class="ghost cut" style="--cut: 14px" aria-hidden="true">
  <div class="time"></div>
  <div class="body">
    <div class="line wide"></div>
    <div class="line"></div>
  </div>
</div>

<style>
  .ghost {
    display: grid;
    grid-template-columns: 104px 1fr;
    gap: 18px;
    padding: 16px 20px 16px 18px;
    background: var(--well);
  }

  .time {
    height: 34px;
    background: color-mix(in srgb, var(--line-strong) 55%, var(--well));
  }

  .body {
    display: grid;
    gap: 8px;
    align-content: start;
    padding-top: 4px;
  }

  .line {
    height: 13px;
    width: 40%;
    background: color-mix(in srgb, var(--line-strong) 40%, var(--well));
  }

  .line.wide {
    height: 19px;
    width: 62%;
  }
</style>
