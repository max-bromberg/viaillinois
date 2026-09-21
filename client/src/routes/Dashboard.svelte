<script>
  import { locationLabel } from '../lib/locationLabel.js';
  import { campusDate, campusTime } from '../lib/campusTime.js';
  import { onMount } from 'svelte';
  import { currentUser, adminRsoIds, boardRsoIds } from '../stores/auth.js';
  import { getRsoDiscord } from '../api/rsoDiscord.js';
  import DiscordPanel from '../lib/DiscordPanel.svelte';
  import { getMe } from '../api/users.js';
  import { getRso, updateRso, addMember, removeMember, getRsoStats } from '../api/rsos.js';
  import { createEvent, createEventSeries, updateEvent, deleteEvent, cancelEvent, restoreEvent } from '../api/events.js';
  import { getCurrentSemester } from '../api/semester.js';
  import { recurrenceLabel } from '../lib/recurrenceLabel.js';
  import EventForm from '../lib/EventForm.svelte';
  import CalendarImport from '../lib/CalendarImport.svelte';
  import { navigate } from '../lib/router.js';
  import { showToast } from '../stores/ui.js';
  import { resolvedTheme } from '../stores/theme.js';
  import { organizationColor } from '../lib/organizationColor.js';
  import { tagHue } from '../lib/tagHue.js';
  import { Button, Field, Pad, Highlight, Numeral, EmptyState, Icon } from '../lib/components/ui/index.js';

  $: if (!$currentUser) navigate('/login');

  // ── Selected RSO ──────────────────────────────────────────────────────────
  let selectedRso = null;
  let loading = false;
  let activeTab = 'events';

  /**
   * Whether this organization has a Discord server connected, as the bot last
   * reported it. Null while it is unknown, which covers both the moment before
   * the answer arrives and a lookup that failed, because a board that has a
   * server should never be reminded to connect one on the strength of a
   * request that did not come back.
   */
  let discordGuilds = null;
  /** Where a board sends somebody to put the bot in their server. */
  let discordInstallUrl = null;
  const DISCORD_NOTICE_KEY = 'via.discordNotice.dismissed';

  /**
   * The organizations this browser has put the reminder away for.
   *
   * Declared after the key it reads, because a const is in its temporal dead
   * zone until the line that declares it runs, and the read is guarded, so the
   * other order left the reminder coming back on every visit with nothing said.
   */
  let discordNoticeDismissed = readDismissedNotices();

  /**
   * Browser storage throws outright in a private window and comes back empty
   * where site data was cleared, and neither is a reason for the dashboard not
   * to draw, so a reminder that cannot be remembered is simply shown again.
   */
  function readDismissedNotices() {
    try {
      const stored = JSON.parse(window.localStorage.getItem(DISCORD_NOTICE_KEY) ?? '[]');
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  }

  function dismissDiscordNotice() {
    discordNoticeDismissed = [...discordNoticeDismissed, selectedRso.rso_id];
    try {
      window.localStorage.setItem(DISCORD_NOTICE_KEY, JSON.stringify(discordNoticeDismissed));
    } catch {
      // Put away for this visit, which is the part that matters right now.
    }
  }

  /**
   * What the bot reported about this organization's servers.
   *
   * A failure leaves the answer unknown rather than empty, so the reminder
   * stays away. The panel in the details tab reads this for itself, because it
   * also needs the address a board adds the bot from and it reloads after a
   * disconnect.
   */
  async function loadDiscord(rsoId) {
    discordGuilds = null;
    try {
      const { guilds, install_url } = await getRsoDiscord(rsoId);
      discordGuilds = guilds ?? [];
      discordInstallUrl = install_url ?? null;
    } catch {
      discordGuilds = null;
    }
  }

  // ── Derived role for selected RSO ─────────────────────────────────────────
  $: userRole = $currentUser?.memberships?.find(m => m.rso_id === selectedRso?.rso_id)?.role
    ?? ($currentUser?.is_global_admin ? 'Board' : null);
  $: isBoard = userRole === 'Board';

  // ── Dashboard-accessible RSO list (Board + Editor) ────────────────────────
  $: dashboardMemberships = ($currentUser?.memberships ?? [])
    .filter(m => ['Board', 'Editor'].includes(m.role));

  // ── Events tab state ──────────────────────────────────────────────────────
  let events = [];
  let showCreateForm = false;
  /**
   * The calendar importer.
   *
   * It used to be drawn only while the manual entry form was open, so a board
   * importing a term of events had to open a form for an event nobody was
   * entering in order to find it.
   */
  let showImport = false;
  let editingEvent = null;
  let semester = null;
  /**
   * A change to one week of a series and a change to the series are different
   * things, so one is held here until the board says which it meant.
   */
  let pendingScope = null;

  // ── Members tab state ─────────────────────────────────────────────────────
  let memberForm = { netId: '', role: 'Member' };
  let confirmRemoveNetId = null;

  // ── RSO Details tab state ─────────────────────────────────────────────────
  let detailsForm = { name: '', description: '', logo_color: '#000000', founded_year: '' };
  let detailsDirty = false;

  // ── Insights tab state ────────────────────────────────────────────────────
  let insights = null;
  let insightsLoading = false;

  async function loadInsights(rsoId) {
    insightsLoading = true;
    try {
      insights = await getRsoStats(rsoId);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      insightsLoading = false;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const fmtDate = d => campusDate(d, { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtTime = d => campusTime(d);
  /**
   * What colour a role is read in. A role is a status, so it is a highlighted
   * word rather than a filled pill, and the colour is the one the rest of the
   * site reads that meaning in.
   */
  function roleTone(role) {
    if (role === 'Board')  return 'var(--primary)';
    if (role === 'Editor') return 'var(--cat-4)';
    return 'var(--muted)';
  }

  /**
   * The organization's colour, bent into the site's range for the theme the
   * page is actually in. The stored colour is never drawn as it was stored.
   */
  $: orgMark = organizationColor(selectedRso?.logo_color, 'mark', $resolvedTheme);
  $: chosenMark = organizationColor(detailsForm.logo_color, 'mark', $resolvedTheme);

  /** The tags an event carries, which arrive as one comma separated string. */
  const tagsOf = event => String(event.tags ?? '').split(',').map(one => one.trim()).filter(Boolean);

  /** Whether a form is open, which decides where the screen's one primary button is. */
  $: formOpen = showCreateForm || !!editingEvent;

  // ── Load RSO ──────────────────────────────────────────────────────────────
  async function loadRso(rsoId) {
    loading = true;
    editingEvent = null;
    showCreateForm = false;
    showImport = false;
    confirmRemoveNetId = null;
    try {
      const { rso } = await getRso(rsoId);
      selectedRso = rso;
      loadDiscord(rsoId);
      events = rso.events || [];
      detailsForm = {
        name: rso.name || '',
        description: rso.description || '',
        logo_color: rso.logo_color || '#000000',
        founded_year: rso.founded_year || '',
      };
      detailsDirty = false;
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    try {
      const { user } = await getMe();
      currentUser.set(user);
    } catch { /* session expired */ }
    try {
      // The repeat controls default to the end of instruction, and the date
      // they arrive at is shown so it can be corrected.
      ({ semester } = await getCurrentSemester());
    } catch {
      semester = null;
    }
    if ($adminRsoIds.length) loadRso($adminRsoIds[0]);
  });

  // ── Event handlers ────────────────────────────────────────────────────────

  /**
   * What to add when the room already shows a reservation.
   *
   * A reservation is not a refusal and it is not a failure. It usually means
   * this organization booked the room through the campus reservation system
   * and VIA collected that booking before the event was entered. The board is
   * told so that a reservation belonging to somebody else does not go unnoticed.
   */
  function reservationNote(dates) {
    if (!dates?.length) return '';
    return ` The room already has a reservation on these dates: ${dates.join(', ')}.`
      + ' Check that the reservation is yours.';
  }

  const SINGLE_RESERVED = 'The room already has a reservation at that time.'
    + ' Check that the reservation is yours.';

  async function handleCreate(e) {
    loading = true;
    try {
      if (e.detail.recurrence) {
        const { created, skipped, reserved } = await createEventSeries(e.detail);
        showToast(
          (skipped?.length
            ? `Created ${created} events. These weeks were left out because the room was taken: ${skipped.join(', ')}.`
            : `Created ${created} events`) + reservationNote(reserved),
          skipped?.length ? 'error' : undefined
        );
      } else {
        const { reserved } = await createEvent(e.detail) ?? {};
        showToast(reserved ? `Event created. ${SINGLE_RESERVED}` : 'Event created');
      }
      showCreateForm = false;
      await loadRso(selectedRso.rso_id);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      loading = false;
    }
  }

  function handleUpdate(e) {
    // An occurrence of a series could mean this week, this week onwards, or
    // every week, and only the board knows which.
    if (editingEvent?.series_id) {
      pendingScope = { kind: 'update', event: editingEvent, payload: e.detail };
      return;
    }
    applyUpdate(editingEvent.event_id, e.detail, 'one');
  }

  async function applyUpdate(eventId, payload, scope) {
    loading = true;
    try {
      const { reserved } = await updateEvent(eventId, payload, scope) ?? {};
      const updated = scope === 'one' ? 'Event updated' : 'Events updated';
      showToast(
        reserved === true
          ? `${updated}. ${SINGLE_RESERVED}`
          : updated + reservationNote(Array.isArray(reserved) ? reserved : null)
      );
      editingEvent = null;
      await loadRso(selectedRso.rso_id);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      loading = false;
    }
  }

  function handleDelete(event) {
    if (event.series_id) {
      pendingScope = { kind: 'delete', event };
      return;
    }
    applyDelete(event.event_id, 'one');
  }

  async function applyDelete(eventId, scope) {
    loading = true;
    try {
      await deleteEvent(eventId, scope);
      showToast(scope === 'one' ? 'Event deleted' : 'Events deleted');
      await loadRso(selectedRso.rso_id);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      loading = false;
    }
  }

  /**
   * Cancelling is a state, not a delete. The event keeps its page so the
   * people who planned to go can be told, and the same row offers to put it
   * back if the cancellation was the mistake.
   */
  function setCancelled(event, cancelled) {
    // An occurrence of a repeat could mean this week, this week onwards, or
    // every week, which is the same question an edit and a delete ask.
    if (event.series_id) {
      pendingScope = { kind: cancelled ? 'cancel' : 'restore', event };
      return;
    }
    applyCancellation(event, cancelled, 'one');
  }

  async function applyCancellation(event, cancelled, scope) {
    loading = true;
    try {
      if (cancelled) await cancelEvent(event.event_id, scope);
      else await restoreEvent(event.event_id, scope);
      showToast(
        scope === 'one'
          ? (cancelled ? 'Event cancelled' : 'Event restored')
          : (cancelled ? 'Events cancelled' : 'Events restored'),
      );
      await loadRso(selectedRso.rso_id);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      loading = false;
    }
  }

  /** What the prompt says it is about to do, in the board's own words. */
  const SCOPE_TITLES = {
    delete: 'Delete a repeating event',
    update: 'Change a repeating event',
    cancel: 'Cancel a repeating event',
    restore: 'Restore a repeating event',
  };

  async function chooseScope(scope) {
    const asked = pendingScope;
    pendingScope = null;
    if (!asked) return;
    if (asked.kind === 'delete') return applyDelete(asked.event.event_id, scope);
    if (asked.kind === 'cancel') return applyCancellation(asked.event, true, scope);
    if (asked.kind === 'restore') return applyCancellation(asked.event, false, scope);
    return applyUpdate(asked.event.event_id, asked.payload, scope);
  }

  /**
   * A calendar file has landed, so the table behind the panel is out of date.
   *
   * Without this the import reported what it had written and the listing went
   * on showing what was there before it, which reads as an import that did
   * nothing.
   */
  async function handleImported(e) {
    const { created = 0, updated = 0 } = e.detail ?? {};
    await loadRso(selectedRso.rso_id);
    showToast(`Imported ${created} ${created === 1 ? 'event' : 'events'}, updated ${updated}.`);
  }

  // ── Member handlers ───────────────────────────────────────────────────────
  async function handleAddMember() {
    if (!memberForm.netId.trim()) return;
    try {
      const result = await addMember(selectedRso.rso_id, memberForm);
      const parts = [`${result.added} added`];
      if (result.invited?.length) {
        parts.push(`${result.invited.length} invited, who will find themselves a member when they first sign in`);
      }
      showToast(parts.join('. '));
      if (result.rejected?.length) {
        showToast(`Could not read: ${result.rejected.join(', ')}`, 'error');
      }
      memberForm = { netId: '', role: 'Member' };
      await loadRso(selectedRso.rso_id);
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  async function handleRemoveMember(netId) {
    try {
      await removeMember(selectedRso.rso_id, netId);
      showToast('Member removed');
      confirmRemoveNetId = null;
      await loadRso(selectedRso.rso_id);
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  // ── Details handlers ──────────────────────────────────────────────────────
  async function handleSaveDetails() {
    loading = true;
    try {
      await updateRso(selectedRso.rso_id, detailsForm);
      showToast('RSO details updated');
      detailsDirty = false;
      await loadRso(selectedRso.rso_id);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      loading = false;
    }
  }

  function switchRso(rsoId) {
    activeTab = 'events';
    insights = null;
    loadRso(rsoId);
  }
</script>

{#if !$currentUser}
  <p class="waiting">Taking you to the sign in page.</p>
{:else if $adminRsoIds.length === 0}
  <EmptyState
    lead="Nothing to manage here yet."
    say="You are not on the board of an organization and you are not listed as one of its editors. Ask the board to add you, and this page fills with their events the next time you sign in."
  />
{:else}
  <div class="dash">

    <!--
      The header.

      The organization switcher used to sit beside the name and the description
      in one row, so an organization with a long description, which ECESAC has,
      pushed the switcher across the header and moved the control under the
      pointer of somebody halfway through clicking it. The switcher has its own
      row above the name, where nothing else decides where it sits, and the
      description is held to a readable measure.
    -->
    {#if dashboardMemberships.length > 1}
      <div class="switcher">
        {#each dashboardMemberships as m}
          <button
            type="button"
            class="check"
            aria-pressed={selectedRso?.rso_id === m.rso_id}
            on:click={() => switchRso(m.rso_id)}
          >
            <Pad
              tone={organizationColor(m.logo_color, 'mark', $resolvedTheme)}
              hollow={selectedRso?.rso_id !== m.rso_id}
            />
            <span>{m.name}</span>
          </button>
        {/each}
      </div>
    {/if}

    <div class="head">
      <h1 class="title">
        {#if selectedRso?.logo_color}<Pad tone={orgMark} class="orgmark" />{/if}
        {selectedRso?.name ?? 'The logistics dashboard'}
      </h1>
      {#if userRole}
        <p class="role"><Highlight tone={roleTone(userRole)}>{userRole}</Highlight></p>
      {/if}
      {#if selectedRso?.description}
        <p class="about">{selectedRso.description}</p>
      {/if}
    </div>

    <!--
      The reminder that no Discord server is connected.

      A reminder rather than a demand. A board with no Discord server, or one
      that does not want the bot, is running their organization perfectly well,
      so this is one quiet line that never stands between somebody and the work
      they opened the dashboard to do, and it can be put away for good. It is
      shown only where the answer is known to be none: a lookup that failed
      leaves it unknown, and a board that has a server is never told to connect
      one because a request did not come back.
    -->
    {#if selectedRso && discordGuilds?.length === 0
         && !discordNoticeDismissed.includes(selectedRso.rso_id)}
      <aside class="dnotice" role="note">
        <Pad />
        <p>
          This organization is not connected to Discord. The VIA bot posts your events in
          your server and reminds your members about them.
        </p>
        <span class="acts">
          {#if discordInstallUrl}
            <a class="btn quiet" href={discordInstallUrl} target="_blank" rel="noopener noreferrer">
              Add the VIA bot
            </a>
          {/if}
          <button type="button" class="iconbtn" aria-label="Dismiss this reminder"
            on:click={dismissDiscordNotice}>
            Dismiss
          </button>
        </span>
      </aside>
    {/if}

    {#if selectedRso}
      <div class="tabs">
        <button
          type="button" class="tab" aria-pressed={activeTab === 'events'}
          on:click={() => { activeTab = 'events'; editingEvent = null; showCreateForm = false; }}
        >Events</button>
        <button
          type="button" class="tab" aria-pressed={activeTab === 'insights'}
          on:click={() => { activeTab = 'insights'; if (!insights) loadInsights(selectedRso.rso_id); }}
        >Insights</button>
        {#if isBoard}
          <button
            type="button" class="tab" aria-pressed={activeTab === 'members'}
            on:click={() => { activeTab = 'members'; confirmRemoveNetId = null; }}
          >Members</button>
          <button
            type="button" class="tab" aria-pressed={activeTab === 'details'}
            on:click={() => activeTab = 'details'}
          >RSO Details</button>
        {/if}
      </div>
    {/if}

    <!-- ── Events ─────────────────────────────────────────────────────────── -->
    {#if activeTab === 'events' && selectedRso}
      <div class="tabbody">
        <div class="tools">
          <Button
            variant={formOpen ? 'secondary' : 'primary'}
            disabled={loading || formOpen}
            onclick={() => { showCreateForm = true; editingEvent = null; }}
          >Add an event</Button>
          <Button variant="secondary" onclick={() => showImport = !showImport}>
            {showImport ? 'Close the importer' : 'Import calendar'}
          </Button>
          <Button variant="quiet" icon="bolt" onclick={() => navigate('/scheduler')}>
            Open the scheduler
          </Button>
        </div>

        {#if showCreateForm}
          <section class="panel cut" style="--cut: 14px">
            <div class="panelhead">
              <h2>A new event</h2>
              <Button variant="quiet" size="sm" onclick={() => showCreateForm = false}>Close the form</Button>
            </div>
            <EventForm rsoId={selectedRso.rso_id} {semester} {loading} on:submit={handleCreate} on:cancel={() => showCreateForm = false} />
          </section>
        {/if}

        {#if showImport}
          <section data-calendar-import class="panel cut" style="--cut: 14px">
            <CalendarImport
              kind="events"
              rsoId={selectedRso.rso_id}
              on:imported={handleImported}
            />
          </section>
        {/if}

        {#if editingEvent}
          <section class="panel cut" style="--cut: 14px">
            <div class="panelhead">
              <h2>Change this event</h2>
              <Button variant="quiet" size="sm" onclick={() => editingEvent = null}>Close the form</Button>
            </div>
            <EventForm rsoId={selectedRso.rso_id} initial={editingEvent} {semester} {loading} on:submit={handleUpdate} on:cancel={() => editingEvent = null} />
          </section>
        {/if}

        <!--
          The listing, built the way the exam listing is built: rows on
          hairlines, with nothing drawn around the outside.
        -->
        {#if loading && events.length === 0}
          <div class="listing" aria-hidden="true">
            {#each Array(4) as _}
              <div class="row settling">
                <span class="bone wide"></span>
                <span class="bone"></span>
                <span class="bone"></span>
                <span class="bone"></span>
                <span class="bone"></span>
                <span class="bone"></span>
              </div>
            {/each}
          </div>
        {:else if events.length === 0 && !showCreateForm}
          <EmptyState
            lead="Nothing on the feed yet."
            say="Add an event and it is on the feed, in the calendar and in the Discord companion straight away. A calendar file from the board's own calendar fills a whole term in one go."
          />
        {:else if events.length > 0}
          <div class="listing" role="table" aria-label="Events this organization has filed">
            <div class="row head" role="row">
              <span role="columnheader">Title</span>
              <span role="columnheader">Who can see it</span>
              <span role="columnheader">When</span>
              <span role="columnheader">Where</span>
              <span role="columnheader">Tags</span>
              <span role="columnheader" class="doing">What you can do</span>
            </div>
            {#each events as event (event.event_id)}
              <div class="row" class:editing={editingEvent?.event_id === event.event_id} role="row">
                <span class="ttl" role="cell">
                  <span class="name" class:struck={event.cancelled_at}>{event.title}</span>
                  <span class="marks">
                    {#if event.cancelled_at}
                      <Highlight tone="var(--danger)">Cancelled</Highlight>
                    {/if}
                    {#if event.series_id}
                      <Highlight tone="var(--primary)" title={recurrenceLabel(event)}>Repeats</Highlight>
                    {/if}
                  </span>
                </span>
                <span class="seen" role="cell">
                  <Highlight tone={event.is_private ? 'var(--plum)' : 'var(--cat-6)'}>
                    {event.is_private ? 'Internal' : 'Public'}
                  </Highlight>
                </span>
                <span class="tm" role="cell">
                  {fmtDate(event.start_time)}
                  <small>{fmtTime(event.start_time)} to {fmtTime(event.end_time)}</small>
                </span>
                <span class="rm" role="cell">{locationLabel(event)}</span>
                <span class="tags" role="cell">
                  {#each tagsOf(event) as tag}
                    <Highlight tone={tagHue(tag)}>{tag}</Highlight>
                  {/each}
                </span>
                <span class="doing" role="cell">
                  <Button variant="secondary" size="sm" on="card"
                    onclick={() => { editingEvent = event; showCreateForm = false; }}
                  >Edit</Button>
                  <Button variant="secondary" size="sm" on="card" icon="share"
                    onclick={() => navigate(`/poster?event=${event.event_id}&rso=${selectedRso.rso_id}`)}
                  >Make a poster</Button>
                  {#if event.cancelled_at}
                    <Button variant="secondary" size="sm" on="card"
                      onclick={() => setCancelled(event, false)}
                    >Restore event</Button>
                  {:else}
                    <Button variant="secondary" size="sm" on="card"
                      onclick={() => setCancelled(event, true)}
                    >Cancel event</Button>
                  {/if}
                  <Button variant="danger" size="sm" onclick={() => handleDelete(event)}>Delete</Button>
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    {#if pendingScope}
      <div class="over">
        <div class="ask cut" style="--cut: 14px" role="dialog" aria-modal="true" aria-labelledby="scope-asked">
          <h2 id="scope-asked">{SCOPE_TITLES[pendingScope.kind] ?? SCOPE_TITLES.update}</h2>
          <p>{recurrenceLabel(pendingScope.event)}.</p>
          <div class="choices">
            <Button variant="secondary" on="card" onclick={() => chooseScope('one')}>This event only</Button>
            <Button variant="secondary" on="card" onclick={() => chooseScope('following')}>This and all later events</Button>
            <Button variant="secondary" on="card" onclick={() => chooseScope('all')}>All events in the series</Button>
          </div>
          <Button variant="quiet" size="sm" onclick={() => pendingScope = null}>Leave it as it is</Button>
        </div>
      </div>
    {/if}

    <!-- ── Insights ───────────────────────────────────────────────────────── -->
    {#if activeTab === 'insights' && selectedRso}
      <div class="tabbody insights">
        {#if insightsLoading}
          <p class="quiet">Reading the numbers for this organization.</p>
        {:else if insights}
          <section>
            <h3>Members by role</h3>
            {#if insights.memberBreakdown.length === 0}
              <p class="quiet">Nobody is a member yet.</p>
            {:else}
              <ul class="counts">
                {#each insights.memberBreakdown as row}
                  <li><Numeral value={row.count} unit={` ${row.role.toLowerCase()}`} size={22} /></li>
                {/each}
              </ul>
            {/if}
          </section>

          <section>
            <h3>Top tags</h3>
            {#if insights.topTags.length === 0}
              <p class="quiet">No event carries a tag yet.</p>
            {:else}
              <ul class="counts">
                {#each insights.topTags as row}
                  <li>
                    <Highlight tone={tagHue(row.tag_name)}>{row.tag_name}</Highlight>
                    <Numeral value={row.usage_count} unit={row.usage_count === 1 ? ' event' : ' events'} size={22} />
                  </li>
                {/each}
              </ul>
            {/if}
          </section>

          <!--
            The one number the platform collects by itself. Interest and
            feedback both arrive through the Discord bot, so a board whose
            members are not on Discord read a column of zeros and learned
            nothing about whether anybody had seen the event at all.

            These are readings rather than readers: nothing about who read a
            page is recorded anywhere, so one person opening it five times is
            five. It is the crude measure deliberately, because the precise one
            is bought with a record of who read what.
          -->
          <section class="whole">
            <h3>How often events were read about</h3>
            {#if !insights.views || insights.views.length === 0}
              <p class="quiet">
                No event page has been read in the last ninety days. A reading is counted when
                somebody opens an event's own page, so this fills in as your events are shared.
              </p>
            {:else}
              <p class="quiet">
                <Numeral value={insights.view_total ?? 0} unit=" readings in the last ninety days" size={22} />
              </p>
              <ul class="lines">
                {#each insights.views as row (row.event_id)}
                  <li>
                    <span class="what">
                      <span class="name">{row.title}</span>
                      <small>{fmtDate(row.start_time)}</small>
                    </span>
                    <Numeral value={row.view_count} unit={row.view_count === 1 ? ' reading' : ' readings'} size={22} />
                  </li>
                {/each}
              </ul>
            {/if}
          </section>

          <!-- The count that replaced RSVPs, from Discord's own controls and the companion's buttons. -->
          <section class="whole">
            <h3>Interest in upcoming events</h3>
            {#if !insights.interest || insights.interest.length === 0}
              <p class="quiet">Nobody has shown interest in an upcoming event yet.</p>
            {:else}
              <ul class="lines">
                {#each insights.interest as row (row.event_id)}
                  <li>
                    <span class="what">
                      <span class="name">{row.title}</span>
                      <small>{fmtDate(row.start_time)}</small>
                    </span>
                    <Numeral value={row.interest_count} unit=" interested" size={22} />
                  </li>
                {/each}
              </ul>
            {/if}
          </section>

          <!-- The average, the count and the comments, and never a rater. -->
          <section class="whole">
            <h3>What people thought</h3>
            <p class="quiet">
              Ratings and comments are anonymous. VIA never tells you who gave which rating.
            </p>
            {#if !insights.feedback || insights.feedback.length === 0}
              <p class="quiet">Nobody has rated an event yet.</p>
            {:else}
              <ul class="lines said">
                {#each insights.feedback as row (row.event_id)}
                  <li>
                    <div class="top">
                      <span class="what">
                        <span class="name">{row.title}</span>
                        <small>{fmtDate(row.start_time)}</small>
                      </span>
                      {#if row.rating_count > 0}
                        <span class="score mono">
                          {row.average_rating} out of 5, from {row.rating_count} rating{row.rating_count === 1 ? '' : 's'}
                        </span>
                      {/if}
                    </div>
                    {#if row.rating_count === 0}
                      <p class="quiet">Nobody has rated this event yet.</p>
                    {:else if row.comments.length === 0}
                      <p class="quiet">Nobody left a comment on this event.</p>
                    {:else}
                      <ul class="comments">
                        {#each row.comments as comment, index (index)}
                          <li><Pad hollow /><span>{comment}</span></li>
                        {/each}
                      </ul>
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        {:else}
          <p class="quiet">Open Insights to read the numbers for this organization.</p>
        {/if}
      </div>
    {/if}

    <!-- ── Members, for the board ─────────────────────────────────────────── -->
    {#if activeTab === 'members' && selectedRso && isBoard}
      <div class="tabbody">
        <div class="listing members" role="table" aria-label="The people in this organization">
          <div class="row head" role="row">
            <span role="columnheader">Name</span>
            <span role="columnheader">NetID</span>
            <span role="columnheader">Role</span>
            <span role="columnheader">Joined</span>
            <span role="columnheader" class="doing">What you can do</span>
          </div>
          {#if !selectedRso.members || selectedRso.members.length === 0}
            <p class="quiet none">Nobody is a member of this organization yet.</p>
          {:else}
            {#each selectedRso.members as member (member.net_id)}
              <div class="row" role="row">
                <span class="ttl" role="cell">
                  <span class="name">{member.full_name || member.net_id}</span>
                  {#if member.invited_at}
                    <span class="marks"><Highlight tone="var(--muted)">Invited</Highlight></span>
                  {/if}
                </span>
                <span class="rm" role="cell">{member.net_id}</span>
                <span role="cell"><Highlight tone={roleTone(member.role)}>{member.role}</Highlight></span>
                <span class="rm" role="cell">{member.joined_at ? fmtDate(member.joined_at) : 'not recorded'}</span>
                <span class="doing" role="cell">
                  {#if confirmRemoveNetId === member.net_id}
                    <span class="sure">Taking them off removes their access.</span>
                    <Button variant="danger" size="sm" onclick={() => handleRemoveMember(member.net_id)}>
                      Yes, remove them
                    </Button>
                    <Button variant="quiet" size="sm" onclick={() => confirmRemoveNetId = null}>Keep them</Button>
                  {:else}
                    <Button variant="secondary" size="sm" onclick={() => confirmRemoveNetId = member.net_id}>
                      Remove from the organization
                    </Button>
                  {/if}
                </span>
              </div>
            {/each}
          {/if}
        </div>

        <div class="adding">
          <Field
            label="NetID"
            id="member-net-id"
            bind:value={memberForm.netId}
            placeholder="NetID, or paste a list of NetIDs or Illinois addresses"
            help="A person who has never signed in is invited, and finds themselves a member the first time they do."
            class="wide"
          />
          <div class="fld role">
            <label for="member-role">Role</label>
            <div class="in">
              <Pad />
              <select id="member-role" bind:value={memberForm.role} style="background: var(--card)">
                <option value="Member">Member</option>
                <option value="Editor">Editor</option>
                <option value="Board">Board</option>
              </select>
            </div>
          </div>
          <Button variant="primary" onclick={handleAddMember}>Add to the organization</Button>
        </div>
        <p class="quiet measure">
          A member sees the organization's internal events. An editor can create and manage
          events as well. A board member can do all of that and can add and remove people.
        </p>
      </div>
    {/if}

    <!-- ── The organization's own details, for the board ──────────────────── -->
    {#if activeTab === 'details' && selectedRso && isBoard}
      <div class="tabbody details">
        <!--
          The board's own Discord server. It reads the same mirror the reminder
          above does, and reloads itself after a disconnect, so the reminder and
          the panel never disagree about whether a server is connected.
        -->
        <DiscordPanel rsoId={selectedRso.rso_id} onchanged={() => loadDiscord(selectedRso.rso_id)} />

        <!--
          The handler is a property rather than an event directive. The field is
          its own component now, and a component does not forward a browser
          event unless it is written to; given as a property it is spread onto
          the input the field draws, which is where the typing happens.
        -->
        <Field label="Name" id="rso-name" bind:value={detailsForm.name} oninput={() => detailsDirty = true} class="wide" />

        <div class="fld wide">
          <label for="rso-description">Description</label>
          <div class="in">
            <Pad />
            <textarea
              id="rso-description"
              rows="3"
              bind:value={detailsForm.description}
              on:input={() => detailsDirty = true}
            ></textarea>
          </div>
          <p class="help">One or two sentences, shown on the feed and on the event page.</p>
        </div>

        <Field
          label="Founded year" id="rso-founded" type="number" placeholder="2018"
          bind:value={detailsForm.founded_year} oninput={() => detailsDirty = true}
        />

        <div class="fld">
          <label for="rso-color">Organization color</label>
          <div class="in">
            <Pad tone={chosenMark} />
            <input
              id="rso-color" type="color" class="swatch"
              bind:value={detailsForm.logo_color} on:input={() => detailsDirty = true}
            />
            <span class="mono hex">{detailsForm.logo_color}</span>
          </div>
          <p class="help">
            VIA bends this colour into its own range before it draws it, so the pad beside
            the picker is what the feed shows rather than the colour as it is stored.
          </p>
        </div>

        <div class="tools">
          <Button variant="primary" disabled={!detailsDirty || loading} onclick={handleSaveDetails}>
            {loading ? 'Saving…' : 'Save the details'}
          </Button>
        </div>
      </div>
    {/if}

  </div>
{/if}

<style>
  /*
   * The reminder that no Discord server is connected.
   *
   * Paper rather than a coloured banner, one line of muted text, and a hairline
   * rule the same weight the rest of the dashboard divides things with. It has
   * to read as a note somebody left rather than as something gone wrong, so it
   * borrows nothing from the toast and nothing from the danger colour.
   */
  .dnotice {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    margin: 0 0 18px; padding: 10px 14px;
    border: 1px solid var(--line); border-radius: 10px;
    background: var(--card); color: var(--muted);
  }
  .dnotice p { margin: 0; font-size: 13.5px; flex: 1 1 260px; }
  .dnotice .acts { display: flex; align-items: center; gap: 4px; }
  .dnotice .iconbtn {
    background: transparent; border: 0; color: var(--muted);
    font: inherit; font-size: 12.5px; cursor: pointer;
    padding: 6px 8px; border-radius: 8px;
  }
  .dnotice .iconbtn:hover { color: var(--ink); }
  .dnotice .iconbtn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

  .dash {
    display: grid;
    gap: 22px;
    align-content: start;
  }

  .waiting,
  .quiet {
    color: var(--muted);
    font-size: 14px;
  }

  .measure {
    max-width: 62ch;
  }

  /* The board tools carry the page title at forty pixels, not fifty six. */
  .title {
    font-family: var(--display);
    font-stretch: 75%;
    font-variation-settings: "opsz" 96;
    font-weight: 800;
    font-size: 40px;
    line-height: 1.05;
    letter-spacing: .006em;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .head {
    display: grid;
    gap: 6px;
    justify-items: start;
  }

  .role,
  .about {
    margin: 0;
  }

  .about {
    color: var(--muted);
    font-size: 14.5px;
    max-width: 62ch;
  }

  .switcher {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 22px;
  }

  .switcher .check,
  .tab {
    font: inherit;
    background: none;
    border: 0;
    padding: 0;
    color: var(--ink);
    cursor: pointer;
  }

  .switcher .check {
    font-size: 14.5px;
    gap: 10px;
  }

  .switcher .check[aria-pressed="false"] span {
    color: var(--muted);
  }

  /*
   * The tabs are words, and the one that is open is underlined by the Current
   * gradient, which is how the feed says which of Upcoming and Past is on.
   */
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 22px;
    border-bottom: 1px solid var(--line);
    padding-bottom: 8px;
  }

  .tab {
    font-family: var(--display);
    font-stretch: 85%;
    font-weight: 700;
    font-size: 15px;
    color: var(--muted);
    position: relative;
    min-height: 32px;
    padding-bottom: 8px;
    margin-bottom: -9px;
  }

  .tab[aria-pressed="true"] {
    color: var(--ink);
  }

  .tab[aria-pressed="true"]::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    background: var(--g-current);
  }

  .tab:focus-visible,
  .switcher .check:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 4px;
  }

  .tabbody {
    display: grid;
    gap: 20px;
    align-content: start;
  }

  .tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 18px;
  }

  /*
   * The one container on the page: the well colour, cut at fourteen pixels, the
   * way the board's panel is drawn on the event page. It is not a rounded
   * rectangle with a hairline around it and it carries no shadow.
   */
  .panel {
    background: var(--well);
    padding: 22px 24px;
    display: grid;
    gap: 18px;
  }

  .panelhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
  }

  .panelhead h2,
  .insights h3 {
    font-family: var(--display);
    font-stretch: 75%;
    font-weight: 800;
    font-size: 22px;
    line-height: 1.1;
    margin: 0;
  }

  /* ── The listing ───────────────────────────────────────────────────────── */

  /*
   * The listing owns the columns and every row takes them as a subgrid.
   *
   * Each row used to write the widths itself, and the last column is sized to
   * its own content: the header's last cell is the words "What you can do" and
   * a row's is four buttons. The two resolved differently, and because the
   * columns before them are fractions, every heading drifted with it. At
   * 1280px the headings stood 125 to 292 pixels right of the cells they name,
   * so "When" sat over who could see the event. One set of widths for the whole
   * listing is the only arrangement in which that cannot happen again.
   */
  .listing {
    display: grid;
    column-gap: 18px;
    grid-template-columns: minmax(0, 1.5fr) 110px 150px minmax(0, 1fr) minmax(0, 1fr) auto;
  }

  .members {
    grid-template-columns: minmax(0, 1.2fr) 140px 110px 120px auto;
  }

  .row {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    align-items: center;
    padding: 14px 0;
    border-top: 1px solid var(--line);
  }

  /* A sentence standing in for the rows, such as an organization with no
     members yet, is not a row and takes the whole width rather than the first
     column. */
  .listing > .none {
    grid-column: 1 / -1;
  }

  .row.head {
    border-top: 0;
    font-family: var(--display);
    font-stretch: 85%;
    font-weight: 700;
    font-size: 12.5px;
    color: var(--muted);
    padding-bottom: 6px;
  }

  .row.editing {
    background: var(--well);
  }

  .row .ttl {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .row .ttl .name {
    font-family: var(--display);
    font-stretch: 90%;
    font-weight: 700;
    font-size: 16px;
  }

  .row .ttl .name.struck {
    text-decoration: line-through;
    color: var(--muted);
  }

  .marks,
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 16px;
    font-size: 13px;
    min-width: 0;
  }

  .row .tm {
    font-family: var(--display);
    font-stretch: 75%;
    font-weight: 700;
    font-size: 20px;
    line-height: 1;
  }

  .row .tm small {
    display: block;
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 400;
    color: var(--muted);
    margin-top: 4px;
  }

  .row .rm {
    font-family: var(--mono);
    font-size: 13px;
    color: var(--muted);
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .row .seen {
    font-size: 13px;
  }

  .doing {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 8px 12px;
  }

  .sure {
    font-size: 12.5px;
    color: var(--danger);
  }

  .none {
    padding: 26px 0;
    border-top: 1px solid var(--line);
  }

  /* Loading draws the shape of the rows in the well colour, with no shimmer. */
  .bone {
    display: block;
    height: 14px;
    border-radius: 2px;
    background: var(--well);
  }

  .bone.wide {
    height: 18px;
  }

  /* ── Insights ──────────────────────────────────────────────────────────── */

  .insights {
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 30px 40px;
  }

  .insights section {
    display: grid;
    gap: 10px;
    align-content: start;
  }

  .insights .whole {
    grid-column: 1 / -1;
  }

  .counts,
  .lines,
  .comments {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }

  .counts li,
  .lines li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px 18px;
  }

  .lines .what {
    min-width: 0;
  }

  .lines .name {
    font-family: var(--display);
    font-stretch: 90%;
    font-weight: 700;
    font-size: 15px;
  }

  .lines .what small {
    font-size: 12.5px;
    color: var(--muted);
    margin-left: 10px;
  }

  .lines .score {
    font-size: 13px;
    color: var(--muted);
  }

  .said > li {
    display: grid;
    gap: 6px;
    padding: 12px 0;
    border-top: 1px solid var(--line);
  }

  .said .top {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px 18px;
  }

  /*
   * A comment is somebody's own words. It is set in, with a pad at its left, so
   * that it reads as quoted without a stripe down its edge.
   */
  .comments li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px;
    align-items: baseline;
    font-size: 14px;
    color: var(--ink-2);
  }

  /* ── Asking which weeks a change is for ────────────────────────────────── */

  .over {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: color-mix(in srgb, var(--ink) 55%, transparent);
  }

  /* The one thing on the page that floats, so the one thing with a shadow. */
  .ask {
    width: 100%;
    max-width: 420px;
    background: var(--card);
    box-shadow: var(--shadow-float);
    padding: 24px;
    display: grid;
    gap: 14px;
    justify-items: start;
  }

  .ask h2 {
    font-family: var(--display);
    font-stretch: 75%;
    font-weight: 800;
    font-size: 26px;
    line-height: 1.1;
    margin: 0;
  }

  .ask p {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
  }

  .ask .choices {
    display: grid;
    gap: 8px;
    justify-items: start;
  }

  /* ── Forms on the members and details tabs ─────────────────────────────── */

  .adding,
  .details {
    display: grid;
    gap: 18px;
    justify-items: start;
  }

  .adding {
    grid-auto-flow: row;
  }

  .tabbody :global(.fld.wide) {
    max-width: 560px;
  }

  .fld .in textarea {
    font: inherit;
    font-size: 16px;
    border: 0;
    background: transparent;
    color: var(--ink);
    outline: 0;
    width: 100%;
    resize: vertical;
  }

  .fld .in select {
    font: inherit;
    font-size: 16px;
    border: 0;
    color: var(--ink);
    outline: 0;
    padding: 2px 0;
  }

  .help {
    font-size: 12.5px;
    color: var(--muted);
    max-width: 52ch;
  }

  .swatch {
    width: 44px;
    height: 28px;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }

  .hex {
    font-size: 13px;
    color: var(--muted);
  }

  @media (max-width: 900px) {
    .row,
    .members .row {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .row.head {
      display: none;
    }

    .doing {
      justify-content: flex-start;
    }
  }

  /*
   * A field written out here rather than taken from the Field component still
   * has to carry the state on its line, so the rule and the pad turn primary
   * when whatever sits between them has the focus.
   */
  .fld .in:focus-within {
    border-color: var(--primary);
    box-shadow: 0 2px 0 0 var(--primary);
  }

  .fld .in:focus-within :global(.pad) {
    --h: var(--primary);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary) 22%, transparent);
  }
</style>
