<script>
  /**
   * The shape of the sky band, before the page knows anything.
   *
   * It draws the band at the hour it is, because the sky is the one thing on the
   * page that is already known, and leaves the shapes of the navigation and the
   * greeting in place of the words. Nothing shimmers.
   */
  import { Sky } from './components/ui/index.js';
</script>

<Sky as="header" aria-hidden="true">
  <div class="nav">
    <div class="ghost mark"></div>
    <div class="links">
      {#each Array(4) as _, at (at)}<span class="ghost link"></span>{/each}
    </div>
  </div>
  <div class="greet">
    <div>
      <div class="ghost lede"></div>
      <div class="ghost name"></div>
    </div>
  </div>
</Sky>

<style>
  .ghost {
    background: color-mix(in srgb, var(--ink) 10%, transparent);
    display: block;
  }

  .mark {
    width: 58px;
    height: 26px;
  }

  .link {
    width: 70px;
    height: 15px;
  }

  .lede {
    width: 180px;
    height: 24px;
  }

  .name {
    width: 320px;
    height: 62px;
    margin-top: 8px;
  }
</style>
