<script>
  import { Sky } from '../Sky/index.js';
  import { Nav } from '../Nav/index.js';
  import { Greeting } from '../Greeting/index.js';
  import { Clock } from '../Clock/index.js';
  import { Trace } from '../Trace/index.js';
  import { campusFields, campusSky } from '../../../campusTime.js';

  /**
   * The sky band.
   *
   * The top of every page: the navigation, the greeting and the clock, on a
   * gradient of the campus sky at this hour, ending in a cut at its bottom left.
   * Everything below it is paper, which is what keeps the page readable at every
   * hour in both themes.
   *
   * The band follows the window rather than the theme. Somebody who chose the
   * light theme still gets a dark band at night, with light ink on it, because
   * the band is the site's clock.
   *
   * See docs/design/08-surfaces.md.
   */
  let {
    /**
     * Which sky. Left unset the band reads the campus hour itself, which is what
     * every page does; the kiosk is the one surface that names a sky outright.
     */
    sky = null,
    /** Where the site can go. */
    links = [],
    /** Which path is open. */
    here = '/',
    /** The instant the page is being read at. */
    at = null,
    /** The person's first name, when somebody is signed in. */
    name = null,
    /** A page title, which stands in place of the greeting away from the feed. */
    title = null,
    /** How many events are on tonight. */
    tonight = null,
    /** Where tonight's events are. */
    where = null,
    /** How many events are on this week. */
    week = null,
    /** The next midterm: how many days away, and which course. */
    midterm = null,
    /** What happens when a link is followed. */
    onnavigate = undefined,
    class: className = '',
    /** What sits at the right of the navigation: the theme dial and signing in. */
    controls,
    ...rest
  } = $props();

  /**
   * The band is the site's clock, so it reads the hour from campusTime rather
   * than being told what time it is. The greeting and the line under the clock
   * read the same hour, so the three never disagree.
   */
  const overhead = $derived(campusSky(at ?? new Date()));
  const showing = $derived(sky ?? overhead.sky);
  const night = $derived(showing === 'night' || (!sky && overhead.next === 'night' && overhead.blend > 0.5));
  const hour = $derived(campusFields(at ?? new Date())?.hour ?? 12);
</script>

<Sky {sky} {at} as="header" class={className} {...rest}>
  <!--
    The one ornament the system permits, in one of the four places it is allowed.
    It replaced the circuit board that used to be drawn behind the whole page,
    which was either too faint to register or, once it registered, a pattern
    running under the reading.
  -->
  <Trace />
  <Nav {links} {here} onDark={night} {onnavigate}>{@render controls?.()}</Nav>
  <Greeting {hour} {name} {title} {tonight} {where} {week} {midterm}>
    <Clock {at} sky={showing} />
  </Greeting>
</Sky>
