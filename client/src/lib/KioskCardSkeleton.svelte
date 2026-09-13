<script>
  /**
   * The lobby screen while it is still asking.
   *
   * docs/design/08-surfaces.md: loading draws the shape of what is coming, with
   * no shimmer, and what arrives settles into place. The screen is the night sky
   * before the first answer as well as after it, so a lobby walks past a display
   * that is already itself rather than a white page waiting to become one.
   *
   * The shapes stand where the organization, the title, the hour, the room and
   * the rail will stand.
   */

  /** How many rows of the rail are drawn. The reference render lists five. */
  const RAIL_ROWS = 5;
</script>

<div class="kiosk">
  <div class="main">
    <div class="k-top"><span class="shape clock"></span></div>
    <div class="spacer"></div>

    <span class="shape org"></span>
    <span class="shape headline"></span>
    <span class="shape headline short"></span>

    <div class="whenk">
      <span class="shape hour"></span>
      <span class="shape room"></span>
    </div>

    <div class="foot" role="status">The screen is reading the feed.</div>
  </div>

  <div class="side">
    <span class="shape heading"></span>
    {#each Array(RAIL_ROWS) as _, row (row)}
      <span class="shape row"></span>
    {/each}
  </div>
</div>

<style>
  /*
   * A shape is the well colour of the screen it is standing on. The kiosk sets
   * the dark palette on itself whatever the theme, so the wash is mixed from
   * that ink rather than from the page's well, which is a light surface in the
   * light theme and would read as a hole in the night sky.
   */
  .shape {
    display: block;
    background: color-mix(in srgb, var(--ink) 10%, transparent);
  }

  .clock {
    width: 180px;
    height: 56px;
    margin-left: auto;
  }

  .org {
    width: 140px;
    height: 18px;
  }

  .headline {
    width: 100%;
    max-width: 820px;
    height: 84px;
    margin-top: 14px;
  }

  .headline.short {
    max-width: 520px;
    margin-top: 10px;
  }

  .whenk {
    margin-top: 26px;
  }

  .hour {
    width: 180px;
    height: 52px;
  }

  .room {
    width: 220px;
    height: 26px;
  }

  .heading {
    width: 120px;
    height: 20px;
  }

  .row {
    width: 100%;
    height: 44px;
  }
</style>
