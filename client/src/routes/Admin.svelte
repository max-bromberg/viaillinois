<script>
  import { locationLabel } from '../lib/locationLabel.js';
  import { onMount } from 'svelte';
  import { navigate } from '../lib/router.js';
  import { isGlobalAdmin } from '../stores/auth.js';
  import { getRsos, getRso, createRso, updateRso, deleteRso, addMember, removeMember } from '../api/rsos.js';
  import { getAdminUsers, createAdminUser, updateAdminUser, resetAdminPassword, deleteAdminUser, getPollStatus, getPollHistory, getUnknownCodes, triggerPoll, getDenials } from '../api/admin.js';
  import { showToast } from '../stores/ui.js';
  import { getAdminMidterms, updateMidtermStatus, deleteMidterm } from '../api/midterms.js';
  import CalendarImport from '../lib/CalendarImport.svelte';
  import TagManager from '../lib/TagManager.svelte';
  import BugReportList from '../lib/BugReportList.svelte';
  import DenialChart from '../lib/DenialChart.svelte';
  import { campusDate, campusDateTime, campusTime } from '../lib/campusTime.js';
  import { resolvedTheme } from '../stores/theme.js';
  import { organizationColor } from '../lib/organizationColor.js';
  import { Button, Field, Pad, Highlight } from '../lib/components/ui/index.js';

  /** The tabs, so that the bar is one list rather than seven hand written buttons. */
  const TABS = [
    { key: 'rsos',         label: 'Organizations' },
    { key: 'users',        label: 'Administrators' },
    { key: 'midterms',     label: 'Midterms' },
    { key: 'dataSources',  label: 'Data sources' },
    { key: 'tags',         label: 'Tags' },
    { key: 'bugReports',   label: 'Bug reports' },
    { key: 'availability', label: 'Requests refused' },
  ];

  /** A midterm's status, in the colour that meaning is read in. */
  const MIDTERM_TONES = {
    Confirmed: 'var(--ok)',
    Cancelled: 'var(--danger)',
    Pending: 'var(--warn)',
  };

  // ── Access control ────────────────────────────────────────────────────────
  $: if (!$isGlobalAdmin) navigate('/');

  // ── Tab state ─────────────────────────────────────────────────────────────
  let activeTab = 'rsos';

  // ── Midterms tab state ────────────────────────────────────────────────────
  let midterms = [];
  let midtermsLoading = false;
  let midtermsLoaded = false;
  let midtermsStatusFilter = 'Pending';
  let confirmDeleteMidtermId = null; // midterm_id pending delete confirmation

  // ── RSOs tab state ────────────────────────────────────────────────────────
  let rsos = [];
  let rsosLoading = false;
  let showCreateRsoForm = false;
  let editingRsoId = null;
  let managingRsoId = null;
  let managingRsoDetail = null;
  let membersLoading = false;

  let rsoForm = { name: '', description: '', logo_color: '#000000', founded_year: '' };
  let memberForm = { netId: '', role: 'Member' };
  let confirmDeleteRsoId = null; // rso_id pending delete confirmation

  // ── Users tab state ───────────────────────────────────────────────────────
  let users = [];
  let usersLoading = false;
  let usersLoaded = false;
  let showCreateUserForm = false;
  let editingNetId = null;
  let resettingNetId = null;

  let confirmDeleteNetId = null; // net_id pending delete confirmation
  let userForm = { net_id: '', full_name: '', email: '', password: '' };
  let editUserForm = { full_name: '', email: '' };
  let passwordForm = { password: '' };

  // ── Data Sources tab state ────────────────────────────────────────────────
  let pollStatus = [];
  let pollLoading = false;
  let pollLoaded = false;
  let unknownCodes = [];
  let unknownCodesLoaded = false;
  let historyOpenFor = null;
  let historyData = {};
  let historyLoading = false;
  let triggeringService = null;
  let mappingFor = {};
  let mappingOpen = {};
  let expandedHistoryRow = {};

  // Availability tab state
  let denials = [];
  let denialsLoading = false;
  let denialWindowDays = 7;

  async function loadDenials() {
    denialsLoading = true;
    try {
      const data = await getDenials(denialWindowDays);
      denials = data.denials;
    } catch (err) {
      showToast('Could not load the denial history.', 'error');
    } finally {
      denialsLoading = false;
    }
  }

  // ── Load users when tab activates ─────────────────────────────────────────
  $: if (activeTab === 'users' && !usersLoaded) loadUsers();
  $: if (activeTab === 'midterms' && !midtermsLoaded) loadMidterms();
  $: if (activeTab === 'dataSources' && !pollLoaded) loadPollStatus();

  // ── RSO functions ─────────────────────────────────────────────────────────

  async function loadRsos() {
    rsosLoading = true;
    try {
      const { rsos: data } = await getRsos();
      rsos = data;
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      rsosLoading = false;
    }
  }

  async function handleCreateRso() {
    try {
      await createRso(rsoForm);
      showToast('RSO created');
      showCreateRsoForm = false;
      rsoForm = { name: '', description: '', logo_color: '#000000', founded_year: '' };
      await loadRsos();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  function startEditRso(rso) {
    editingRsoId = rso.rso_id;
    if (managingRsoId === rso.rso_id) managingRsoId = null;
    rsoForm = {
      name: rso.name,
      description: rso.description || '',
      logo_color: rso.logo_color || '#000000',
      founded_year: rso.founded_year || '',
    };
  }

  async function handleDeleteRso(rsoId) {
    try {
      await deleteRso(rsoId);
      showToast('RSO deleted');
      confirmDeleteRsoId = null;
      editingRsoId = null;
      managingRsoId = null;
      await loadRsos();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  async function handleUpdateRso(rsoId) {
    try {
      await updateRso(rsoId, rsoForm);
      showToast('RSO updated');
      editingRsoId = null;
      await loadRsos();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  async function startManageMembers(rsoId) {
    if (managingRsoId === rsoId) {
      managingRsoId = null;
      managingRsoDetail = null;
      return;
    }
    if (editingRsoId === rsoId) editingRsoId = null;
    managingRsoId = rsoId;
    managingRsoDetail = null;
    memberForm = { netId: '', role: 'Member' };
    membersLoading = true;
    try {
      const { rso } = await getRso(rsoId);
      managingRsoDetail = rso;
    } catch (e) {
      showToast(e.message, 'error');
      managingRsoId = null;
    } finally {
      membersLoading = false;
    }
  }

  async function handleAddMember(rsoId) {
    try {
      await addMember(rsoId, memberForm);
      showToast('Member added');
      memberForm = { netId: '', role: 'Member' };
      const { rso } = await getRso(rsoId);
      managingRsoDetail = rso;
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  async function handleRemoveMember(rsoId, netId) {
    try {
      await removeMember(rsoId, netId);
      showToast('Member removed');
      const { rso } = await getRso(rsoId);
      managingRsoDetail = rso;
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  // ── User functions ────────────────────────────────────────────────────────

  async function loadUsers() {
    usersLoading = true;
    try {
      const { users: data } = await getAdminUsers();
      users = data;
      usersLoaded = true;
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      usersLoading = false;
    }
  }

  async function handleCreateUser() {
    try {
      await createAdminUser(userForm);
      showToast('User created');
      showCreateUserForm = false;
      userForm = { net_id: '', full_name: '', email: '', password: '' };
      usersLoaded = false;
      await loadUsers();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  function startEditUser(user) {
    editingNetId = user.net_id;
    if (resettingNetId === user.net_id) resettingNetId = null;
    editUserForm = { full_name: user.full_name, email: user.email };
  }

  async function handleUpdateUser(netId) {
    try {
      await updateAdminUser(netId, editUserForm);
      showToast('User updated');
      editingNetId = null;
      usersLoaded = false;
      await loadUsers();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  function startResetPassword(netId) {
    resettingNetId = netId;
    if (editingNetId === netId) editingNetId = null;
    passwordForm = { password: '' };
  }

  async function handleResetPassword(netId) {
    try {
      await resetAdminPassword(netId, passwordForm);
      showToast('Password reset');
      resettingNetId = null;
      passwordForm = { password: '' };
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  /**
   * Remove an administrator.
   *
   * The confirmation used to be the browser's own dialog, which is the one
   * thing on the page the site cannot dress and the one thing a reader cannot
   * read in context. It is asked in the row instead, the way every other
   * removal on this page is asked.
   */
  async function handleDeleteUser(netId) {
    try {
      await deleteAdminUser(netId);
      showToast('Administrator removed');
      confirmDeleteNetId = null;
      usersLoaded = false;
      await loadUsers();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  // ── Midterm functions ─────────────────────────────────────────────────────
  async function loadMidterms() {
    midtermsLoading = true;
    try {
      const { midterms: data } = await getAdminMidterms();
      midterms = data;
      midtermsLoaded = true;
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      midtermsLoading = false;
    }
  }

  async function handleMidtermStatus(midtermId, status) {
    try {
      await updateMidtermStatus(midtermId, status);
      showToast(`Midterm ${status.toLowerCase()}`);
      midtermsLoaded = false;
      await loadMidterms();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  /**
   * Remove a midterm outright.
   *
   * Cancelling keeps the row, which is right for an exam that was scheduled and
   * then called off. An entry that should never have been listed needs to go.
   */
  async function handleDeleteMidterm(midtermId) {
    try {
      await deleteMidterm(midtermId);
      showToast('Midterm deleted');
      confirmDeleteMidtermId = null;
      midtermsLoaded = false;
      await loadMidterms();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  // ── Data Sources functions ────────────────────────────────────────────────

  /** How long ago something happened, written out rather than abbreviated. */
  function relativeTime(isoStr) {
    if (!isoStr) return 'never';
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} ${hrs === 1 ? 'hour' : 'hours'} ago`;
    const days = Math.floor(hrs / 24);
    return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  }

  function runDuration(startedAt, finishedAt) {
    if (!startedAt || !finishedAt) return 'not recorded';
    const ms = new Date(finishedAt) - new Date(startedAt);
    if (ms < 1000) return `${ms} milliseconds`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)} seconds`;
    const mins = Math.floor(ms / 60000);
    return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ${Math.floor((ms % 60000) / 1000)} seconds`;
  }

  /**
   * How a run went, in words and in the colour that meaning is read in. It was
   * a filled pill, which is the one shape the design does not use for a status.
   */
  function statusBadge(run) {
    if (!run) return { label: 'Never run', tone: 'var(--muted)' };
    if (!run.finished_at) return { label: 'Running now', tone: 'var(--warn)' };
    if (run.error_count > 0) return { label: 'It failed', tone: 'var(--danger)' };
    return { label: 'It ran', tone: 'var(--ok)' };
  }

  async function loadPollStatus() {
    pollLoading = true;
    try {
      const [{ pollStatus: data }, { unknownCodes: codes }] = await Promise.all([
        getPollStatus(),
        getUnknownCodes(),
      ]);
      pollStatus = data;
      unknownCodes = codes;
      pollLoaded = true;
      unknownCodesLoaded = true;
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      pollLoading = false;
    }
  }

  async function loadHistory(service) {
    if (historyOpenFor === service) {
      historyOpenFor = null;
      const serviceLogIds = new Set((historyData[service] ?? []).map(r => String(r.log_id)));
      expandedHistoryRow = Object.fromEntries(
        Object.entries(expandedHistoryRow).filter(([id]) => !serviceLogIds.has(id))
      );
      return;
    }
    historyOpenFor = service;
    if (historyData[service]) return;
    historyLoading = true;
    try {
      const { history } = await getPollHistory(service);
      historyData = { ...historyData, [service]: history };
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      historyLoading = false;
    }
  }

  async function handleTrigger(service) {
    triggeringService = service;
    if (historyOpenFor === service) historyOpenFor = null;
    try {
      await triggerPoll(service);
      showToast(`${service} poller started`);
      pollLoaded = false;
      historyData = { ...historyData, [service]: undefined };
      await loadPollStatus();
    } catch (e) {
      const alreadyRunning = e.message?.includes('already running');
      showToast(e.message, alreadyRunning ? 'success' : 'error');
      if (alreadyRunning) await loadPollStatus();
    } finally {
      triggeringService = null;
    }
  }

  function buildCodeLine(rawCode, canonicalName) {
    if (!canonicalName.trim()) return '';
    return `  '${rawCode}': '${canonicalName.trim()}',`;
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copied.');
    } catch {
      showToast('The line could not be copied. Select it and copy it by hand.', 'error');
    }
  }

  const SERVICE_LABELS = { courses: 'Course Explorer', facilities: 'Facilities (Tableau)', astra: 'Ad Astra' };

  /** An organization's colour, bent into the site's range for this theme. */
  $: markOf = (stored) => organizationColor(stored, 'mark', $resolvedTheme);
  const ALL_SERVICES = Object.keys(SERVICE_LABELS);

  // ── Init ──────────────────────────────────────────────────────────────────
  onMount(() => {
    loadRsos();
  });
</script>

{#if !$isGlobalAdmin}
  <p class="quiet">Taking you back to the feed.</p>
{:else}
  <div class="admin">

    <h1 class="title">Admin</h1>

    <div class="tabs">
      {#each TABS as tab}
        <button
          type="button" class="tab" aria-pressed={activeTab === tab.key}
          on:click={() => {
            activeTab = tab.key;
            if (tab.key === 'availability') loadDenials();
          }}
        >{tab.label}</button>
      {/each}
    </div>

    <!-- ── Organizations ──────────────────────────────────────────────────── -->
    {#if activeTab === 'rsos'}
      <div class="tabbody">
        <div class="tools">
          <p class="quiet">
            {rsosLoading
              ? 'Reading the organizations.'
              : `VIA carries ${rsos.length} ${rsos.length === 1 ? 'organization' : 'organizations'}.`}
          </p>
          <Button
            variant={showCreateRsoForm ? 'secondary' : 'primary'}
            onclick={() => { showCreateRsoForm = !showCreateRsoForm; }}
          >
            {showCreateRsoForm ? 'Close the form' : 'Add an organization'}
          </Button>
        </div>

        {#if showCreateRsoForm}
          <section class="panel cut" style="--cut: 14px">
            <h2>A new organization</h2>
            <div class="pair">
              <Field label="Name" id="new-rso-name" bind:value={rsoForm.name} placeholder="IEEE" />
              <Field label="Founded year" id="new-rso-founded" type="number" placeholder="2018"
                bind:value={rsoForm.founded_year} />
            </div>
            <Field label="Description" id="new-rso-description" bind:value={rsoForm.description}
              placeholder="One or two sentences about what the organization does." class="wide" />
            <div class="fld">
              <label for="new-rso-color">Organization color</label>
              <div class="in">
                <Pad tone={markOf(rsoForm.logo_color)} />
                <input id="new-rso-color" type="color" class="swatch" bind:value={rsoForm.logo_color} />
                <span class="mono hex">{rsoForm.logo_color}</span>
              </div>
              <p class="help">VIA bends this colour into its own range before it draws it.</p>
            </div>
            <div class="tools left">
              <Button variant="secondary" on="card" onclick={handleCreateRso}>Create the organization</Button>
              <Button
                variant="quiet"
                onclick={() => { showCreateRsoForm = false; rsoForm = { name: '', description: '', logo_color: '#000000', founded_year: '' }; }}
              >Close without saving</Button>
            </div>
          </section>
        {/if}

        {#if rsosLoading}
          <p class="quiet">Reading the organizations.</p>
        {:else if rsos.length === 0}
          <p class="quiet">VIA carries no organizations yet.</p>
        {:else}
          <div class="listing">
            {#each rsos as rso (rso.rso_id)}
              <div class="row">
                <span class="ttl">
                  <Pad tone={markOf(rso.logo_color)} class="orgmark" />
                  <span class="name">{rso.name}</span>
                  {#if rso.founded_year}<small>founded {rso.founded_year}</small>{/if}
                </span>
                <span class="doing">
                  <Button
                    variant="secondary" size="sm"
                    onclick={() => {
                      if (editingRsoId === rso.rso_id) { editingRsoId = null; }
                      else { startEditRso(rso); }
                    }}
                  >{editingRsoId === rso.rso_id ? 'Close the form' : 'Edit'}</Button>
                  <Button variant="secondary" size="sm" onclick={() => startManageMembers(rso.rso_id)}>
                    {managingRsoId === rso.rso_id ? 'Close the members' : 'Members'}
                  </Button>
                  {#if confirmDeleteRsoId === rso.rso_id}
                    <span class="sure">Deleting an organization takes its events with it.</span>
                    <Button variant="danger" size="sm" onclick={() => handleDeleteRso(rso.rso_id)}>Yes, delete it</Button>
                    <Button variant="quiet" size="sm" onclick={() => confirmDeleteRsoId = null}>Keep it</Button>
                  {:else}
                    <Button
                      variant="secondary" size="sm"
                      onclick={() => { confirmDeleteRsoId = rso.rso_id; editingRsoId = null; managingRsoId = null; }}
                    >Delete</Button>
                  {/if}
                </span>
              </div>

              {#if editingRsoId === rso.rso_id}
                <section class="panel cut under" style="--cut: 14px">
                  <h3>Change this organization</h3>
                  <div class="pair">
                    <Field label="Name" id="rso-name-{rso.rso_id}" bind:value={rsoForm.name} />
                    <Field label="Founded year" id="rso-founded-{rso.rso_id}" type="number" bind:value={rsoForm.founded_year} />
                  </div>
                  <Field label="Description" id="rso-description-{rso.rso_id}" bind:value={rsoForm.description} class="wide" />
                  <div class="fld">
                    <label for="rso-color-{rso.rso_id}">Organization color</label>
                    <div class="in">
                      <Pad tone={markOf(rsoForm.logo_color)} />
                      <input id="rso-color-{rso.rso_id}" type="color" class="swatch" bind:value={rsoForm.logo_color} />
                      <span class="mono hex">{rsoForm.logo_color}</span>
                    </div>
                  </div>
                  <div class="tools left">
                    <Button variant="secondary" on="card" onclick={() => handleUpdateRso(rso.rso_id)}>Save the changes</Button>
                    <Button variant="quiet" onclick={() => editingRsoId = null}>Close without saving</Button>
                  </div>
                </section>
              {/if}

              {#if managingRsoId === rso.rso_id}
                <section class="panel cut under" style="--cut: 14px">
                  <h3>
                    The people in {rso.name}{#if managingRsoDetail},
                      {managingRsoDetail.members?.length ?? 0} of them{/if}
                  </h3>

                  {#if membersLoading}
                    <p class="quiet">Reading the members.</p>
                  {:else if managingRsoDetail}
                    {#if managingRsoDetail.members && managingRsoDetail.members.length > 0}
                      <div class="listing">
                        {#each managingRsoDetail.members as member (member.net_id)}
                          <div class="row">
                            <span class="ttl">
                              <span class="name">{member.full_name}</span>
                              <small class="mono">{member.net_id}</small>
                              <small>{member.role}</small>
                            </span>
                            <span class="doing">
                              <Button variant="secondary" size="sm" on="card"
                                onclick={() => handleRemoveMember(rso.rso_id, member.net_id)}
                              >Remove from the organization</Button>
                            </span>
                          </div>
                        {/each}
                      </div>
                    {:else}
                      <p class="quiet">Nobody is a member of this organization yet.</p>
                    {/if}

                    <div class="adding">
                      <Field label="NetID" id="member-net-id-{rso.rso_id}" bind:value={memberForm.netId} placeholder="jsmith3" />
                      <div class="fld role">
                        <label for="member-role-{rso.rso_id}">Role</label>
                        <div class="in">
                          <Pad />
                          <select id="member-role-{rso.rso_id}" bind:value={memberForm.role} style="background: var(--well)">
                            <option value="Member">Member</option>
                            <option value="Editor">Editor</option>
                            <option value="Board">Board</option>
                          </select>
                        </div>
                      </div>
                      <Button variant="secondary" on="card" onclick={() => handleAddMember(rso.rso_id)}>
                        Add to the organization
                      </Button>
                    </div>
                  {/if}
                </section>
              {/if}
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- ── Administrators ─────────────────────────────────────────────────── -->
    {#if activeTab === 'users'}
      <div class="tabbody">
        <div class="tools">
          <p class="quiet">
            {usersLoading
              ? 'Reading the administrators.'
              : `VIA has ${users.length} ${users.length === 1 ? 'administrator' : 'administrators'}.`}
          </p>
          <Button
            variant={showCreateUserForm ? 'secondary' : 'primary'}
            onclick={() => { showCreateUserForm = !showCreateUserForm; }}
          >
            {showCreateUserForm ? 'Close the form' : 'Add an administrator'}
          </Button>
        </div>

        {#if showCreateUserForm}
          <section class="panel cut" style="--cut: 14px">
            <h2>A new administrator</h2>
            <div class="pair">
              <Field label="NetID" id="new-user-net-id" bind:value={userForm.net_id} placeholder="jsmith3" />
              <Field label="Full name" id="new-user-name" bind:value={userForm.full_name} placeholder="Jane Smith" />
              <Field label="Email" id="new-user-email" type="email" bind:value={userForm.email} placeholder="jsmith3@illinois.edu" />
              <Field label="Password" id="new-user-password" type="password" bind:value={userForm.password}
                help="The password they sign in with the first time." />
            </div>
            <div class="tools left">
              <Button variant="secondary" on="card" onclick={handleCreateUser}>Create the administrator</Button>
              <Button
                variant="quiet"
                onclick={() => { showCreateUserForm = false; userForm = { net_id: '', full_name: '', email: '', password: '' }; }}
              >Close without saving</Button>
            </div>
          </section>
        {/if}

        {#if usersLoading}
          <p class="quiet">Reading the administrators.</p>
        {:else if users.length === 0}
          <p class="quiet">VIA has no administrators with a password of their own yet.</p>
        {:else}
          <div class="listing">
            {#each users as user (user.net_id)}
              <div class="row">
                <span class="ttl">
                  <span class="name">{user.full_name}</span>
                  <small class="mono">{user.net_id}</small>
                  <small>{user.email}</small>
                </span>
                <span class="doing">
                  <Button
                    variant="secondary" size="sm"
                    onclick={() => {
                      if (editingNetId === user.net_id) { editingNetId = null; }
                      else { startEditUser(user); }
                    }}
                  >{editingNetId === user.net_id ? 'Close the form' : 'Edit'}</Button>
                  <Button
                    variant="secondary" size="sm"
                    onclick={() => {
                      if (resettingNetId === user.net_id) { resettingNetId = null; }
                      else { startResetPassword(user.net_id); }
                    }}
                  >{resettingNetId === user.net_id ? 'Close the form' : 'Set a new password'}</Button>
                  {#if confirmDeleteNetId === user.net_id}
                    <span class="sure">This takes away their way in.</span>
                    <Button variant="danger" size="sm" onclick={() => handleDeleteUser(user.net_id)}>Yes, remove them</Button>
                    <Button variant="quiet" size="sm" onclick={() => confirmDeleteNetId = null}>Keep them</Button>
                  {:else}
                    <Button variant="secondary" size="sm" onclick={() => confirmDeleteNetId = user.net_id}>Delete</Button>
                  {/if}
                </span>
              </div>

              {#if editingNetId === user.net_id}
                <section class="panel cut under" style="--cut: 14px">
                  <h3>Change this administrator</h3>
                  <div class="pair">
                    <Field label="Full name" id="user-name-{user.net_id}" bind:value={editUserForm.full_name} />
                    <Field label="Email" id="user-email-{user.net_id}" type="email" bind:value={editUserForm.email} />
                  </div>
                  <div class="tools left">
                    <Button variant="secondary" on="card" onclick={() => handleUpdateUser(user.net_id)}>Save the changes</Button>
                    <Button variant="quiet" onclick={() => editingNetId = null}>Close without saving</Button>
                  </div>
                </section>
              {/if}

              {#if resettingNetId === user.net_id}
                <section class="panel cut under" style="--cut: 14px">
                  <h3>A new password for this administrator</h3>
                  <Field label="New password" id="user-password-{user.net_id}" type="password"
                    bind:value={passwordForm.password} />
                  <div class="tools left">
                    <Button variant="secondary" on="card" onclick={() => handleResetPassword(user.net_id)}>
                      Set the password
                    </Button>
                    <Button variant="quiet" onclick={() => resettingNetId = null}>Close without saving</Button>
                  </div>
                </section>
              {/if}
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- ── Midterms ───────────────────────────────────────────────────────── -->
    {#if activeTab === 'midterms'}
      <div class="tabbody">
        <CalendarImport kind="midterms" on:imported={() => { midtermsLoaded = false; loadMidterms(); }} />

        <div class="choices">
          {#each ['Pending', 'Confirmed', 'Cancelled', 'All'] as f}
            {@const count = f === 'All' ? midterms.length : midterms.filter(m => (m.confirmation_status ?? 'Pending') === f).length}
            <button
              type="button" class="check" aria-pressed={midtermsStatusFilter === f}
              on:click={() => midtermsStatusFilter = f}
            >
              <Pad hollow={midtermsStatusFilter !== f} />
              <span>{f}{#if !midtermsLoading} ({count}){/if}</span>
            </button>
          {/each}
        </div>

        {#if midtermsLoading}
          <p class="quiet">Reading the midterms.</p>
        {:else}
          {@const filtered = midtermsStatusFilter === 'All'
            ? midterms
            : midterms.filter(m => (m.confirmation_status ?? 'Pending') === midtermsStatusFilter)}
          {#if filtered.length === 0}
            <p class="quiet">
              {midterms.length === 0
                ? 'Nobody has submitted a midterm yet.'
                : `There are no ${midtermsStatusFilter.toLowerCase()} midterms.`}
            </p>
          {:else}
            <div class="listing midterms">
              {#each filtered as mt (mt.midterm_id)}
                <div class="row">
                  <span class="code">
                    {mt.course_code}
                    <small>{mt.course_title ?? ''}</small>
                  </span>
                  <span class="ttl">
                    <span class="name">{mt.title}</span>
                    <small>
                      {#if mt.submitted_by}Submitted by {mt.submitted_by}{:else}Imported from a calendar{/if}
                    </small>
                  </span>
                  <span class="tm">
                    {campusDate(mt.start_time, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    <small>{campusTime(mt.start_time)} to {campusTime(mt.end_time)}</small>
                  </span>
                  <span class="rm">{locationLabel(mt)}</span>
                  <span class="st">
                    <Highlight tone={MIDTERM_TONES[mt.confirmation_status ?? 'Pending'] ?? 'var(--warn)'}>
                      {mt.confirmation_status ?? 'Pending'}
                    </Highlight>
                  </span>
                  <span class="doing">
                    {#if mt.confirmation_status !== 'Confirmed'}
                      <Button variant="secondary" size="sm" onclick={() => handleMidtermStatus(mt.midterm_id, 'Confirmed')}>
                        Confirm it
                      </Button>
                    {/if}
                    {#if mt.confirmation_status !== 'Cancelled'}
                      <Button variant="secondary" size="sm" onclick={() => handleMidtermStatus(mt.midterm_id, 'Cancelled')}>
                        Cancel it
                      </Button>
                    {/if}
                    {#if mt.confirmation_status === 'Cancelled' || mt.confirmation_status === 'Confirmed'}
                      <Button variant="secondary" size="sm" onclick={() => handleMidtermStatus(mt.midterm_id, 'Pending')}>
                        Put it back to pending
                      </Button>
                    {/if}
                    {#if confirmDeleteMidtermId === mt.midterm_id}
                      <span class="sure">
                        {#if mt.submitted_by}
                          Deleting it takes it off the schedule for good.
                        {:else}
                          This midterm came from a calendar, so the next import of that calendar
                          will add it back. Cancel it instead to keep it off the schedule.
                        {/if}
                      </span>
                      <Button variant="danger" size="sm" onclick={() => handleDeleteMidterm(mt.midterm_id)}>
                        Yes, delete it
                      </Button>
                      <Button variant="quiet" size="sm" onclick={() => confirmDeleteMidtermId = null}>Keep it</Button>
                    {:else}
                      <Button variant="secondary" size="sm" onclick={() => confirmDeleteMidtermId = mt.midterm_id}>
                        Delete
                      </Button>
                    {/if}
                  </span>
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    {/if}

    <!-- ── Data sources ───────────────────────────────────────────────────── -->
    {#if activeTab === 'dataSources'}
      <div class="tabbody">
        <p class="careful">
          A run started by hand costs the server real work, so start one only when you need
          it. The facilities poller opens a whole browser session to do its reading.
        </p>

        {#if pollLoading}
          <p class="quiet">Reading how the pollers are getting on.</p>
        {:else}
          <div class="listing">
            {#each ALL_SERVICES as service}
              {@const run = pollStatus.find(r => r.service === service) ?? null}
              {@const badge = statusBadge(run)}
              <div class="row">
                <span class="ttl">
                  <span class="name">{SERVICE_LABELS[service]}</span>
                  <Highlight tone={badge.tone}>{badge.label}</Highlight>
                  {#if run}
                    <small>{run.finished_at ? relativeTime(run.finished_at) : `started ${relativeTime(run.started_at)}`}</small>
                  {/if}
                  {#if run?.metadata?.totalCourses != null}
                    <small>{run.metadata.totalCourses} courses, {run.metadata.totalSections} sections</small>
                  {/if}
                </span>
                <span class="counts">
                  {#if run}
                    <span class="mono">{run.rows_processed} read, {run.rows_skipped} skipped</span>
                    {#if run.error_count > 0}
                      <span class="wrong">{run.error_count} {run.error_count === 1 ? 'error' : 'errors'}</span>
                    {/if}
                  {/if}
                </span>
                <span class="doing">
                  <Button variant="secondary" size="sm" onclick={() => loadHistory(service)}>
                    {historyOpenFor === service ? 'Hide the history' : 'History'}
                  </Button>
                  <Button
                    variant="secondary" size="sm"
                    disabled={triggeringService === service}
                    onclick={() => handleTrigger(service)}
                  >{triggeringService === service ? 'Starting it' : 'Run it now'}</Button>
                </span>
              </div>

              {#if historyOpenFor === service}
                <section class="panel cut under" style="--cut: 14px">
                  {#if historyLoading && !historyData[service]}
                    <p class="quiet">Reading the history.</p>
                  {:else if !historyData[service] || historyData[service].length === 0}
                    <p class="quiet">This poller has no runs on record yet.</p>
                  {:else}
                    <div class="listing runs" role="table" aria-label="Runs of {SERVICE_LABELS[service]}">
                      <div class="row head" role="row">
                        <span role="columnheader">Started</span>
                        <span role="columnheader">How long</span>
                        <span role="columnheader">Read</span>
                        <span role="columnheader">Skipped</span>
                        <span role="columnheader">Errors</span>
                        <span role="columnheader">How it went</span>
                      </div>
                      {#each historyData[service] as row (row.log_id)}
                        {@const rowBadge = statusBadge(row)}
                        {@const tellable = row.error_count > 0 || !row.finished_at}
                        <div class="row" role="row">
                          <span class="mono" role="cell">
                            {campusDateTime(row.started_at, { date: { month: 'short', day: 'numeric', year: 'numeric' }, time: { hour: 'numeric', minute: '2-digit' }, separator: ', ' })}
                          </span>
                          <span class="mono" role="cell">{runDuration(row.started_at, row.finished_at)}</span>
                          <span class="mono" role="cell">{row.rows_processed}</span>
                          <span class="mono" role="cell">{row.rows_skipped}</span>
                          <span class="mono" class:wrong={row.error_count > 0} role="cell">{row.error_count}</span>
                          <span role="cell">
                            <Highlight tone={rowBadge.tone}>{rowBadge.label}</Highlight>
                            {#if tellable}
                              <Button
                                variant="quiet" size="sm"
                                onclick={() => { expandedHistoryRow = { ...expandedHistoryRow, [row.log_id]: !expandedHistoryRow[row.log_id] }; }}
                              >{expandedHistoryRow[row.log_id] ? 'Hide what went wrong' : 'What went wrong'}</Button>
                            {/if}
                          </span>
                        </div>
                        {#if expandedHistoryRow[row.log_id] && row.last_error}
                          <pre class="said">{row.last_error}</pre>
                        {/if}
                      {/each}
                    </div>
                  {/if}
                </section>
              {/if}
            {/each}
          </div>

          <section class="group">
            <h2>Building codes VIA does not know</h2>
            {#if !unknownCodesLoaded}
              <p class="quiet">Reading the codes.</p>
            {:else if unknownCodes.length === 0}
              <p class="quiet">Every building code the pollers have seen is one VIA knows.</p>
            {:else}
              <p class="help">
                These codes came out of poller data and are not in the static map in
                <code>server/lib/locationNormalizer.js</code>. Add the line each one generates to
                <code>BUILDING_CODE_MAP</code> in a later change.
              </p>
              <div class="listing">
                {#each unknownCodes as uc (uc.raw_code)}
                  <div class="row">
                    <span class="ttl">
                      <code class="name">{uc.raw_code}</code>
                      <small>
                        seen {uc.occurrences} {uc.occurrences === 1 ? 'time' : 'times'}, last {relativeTime(uc.last_seen)}
                      </small>
                    </span>
                    <span class="doing">
                      <Button
                        variant="secondary" size="sm"
                        onclick={() => {
                          mappingOpen = { ...mappingOpen, [uc.raw_code]: !mappingOpen[uc.raw_code] };
                          if (!mappingFor[uc.raw_code]) mappingFor = { ...mappingFor, [uc.raw_code]: '' };
                        }}
                      >{mappingOpen[uc.raw_code] ? 'Close the form' : 'Write the mapping'}</Button>
                    </span>
                  </div>

                  {#if mappingOpen[uc.raw_code]}
                    <section class="panel cut under" style="--cut: 14px">
                      <Field
                        label="The building's full name"
                        id="mapping-{uc.raw_code}"
                        bind:value={mappingFor[uc.raw_code]}
                        placeholder="Natural Sciences Research Center"
                        class="wide"
                      />
                      {#if mappingFor[uc.raw_code]?.trim()}
                        {@const codeLine = buildCodeLine(uc.raw_code, mappingFor[uc.raw_code])}
                        <div class="tools left">
                          <code class="line">{codeLine}</code>
                          <Button variant="secondary" size="sm" on="card" onclick={() => copyToClipboard(codeLine)}>
                            Copy the line
                          </Button>
                        </div>
                        <p class="help">
                          Add this line to <code>BUILDING_CODE_MAP</code> in
                          <code>server/lib/locationNormalizer.js</code> in a later change.
                        </p>
                      {/if}
                    </section>
                  {/if}
                {/each}
              </div>
            {/if}
          </section>
        {/if}
      </div>
    {/if}

    {#if activeTab === 'tags'}
      <TagManager />
    {/if}

    {#if activeTab === 'bugReports'}
      <BugReportList />
    {/if}

    <!-- ── Requests VIA refused ───────────────────────────────────────────── -->
    {#if activeTab === 'availability'}
      <div class="tabbody">
        <div class="tools">
          <h2>Requests VIA refused</h2>
          <div class="fld window">
            <label for="denial-window">How far back to look</label>
            <div class="in">
              <Pad />
              <select
                id="denial-window" bind:value={denialWindowDays} on:change={loadDenials}
                style="background: var(--paper)"
              >
                <option value={1}>The last day</option>
                <option value={7}>The last week</option>
                <option value={30}>The last 30 days</option>
                <option value={90}>The last 90 days</option>
              </select>
            </div>
          </div>
        </div>
        <p class="help wide">
          Every request the platform turned away, grouped by day and by reason. VIA refuses a
          request when it is too busy to answer, when one caller is asking far more often than
          a reader would, or when a page far past the end of a listing is asked for. An empty
          chart means those limits are not touching real readers, and a chart that fills up is
          the sign that one of them needs loosening.
        </p>
        {#if denialsLoading}
          <p class="quiet">Reading the history of refused requests.</p>
        {:else}
          <DenialChart series={denials} />
        {/if}
      </div>
    {/if}

  </div>
{/if}

<style>
  .admin {
    display: grid;
    gap: 22px;
    align-content: start;
  }

  /* A board tool carries its title at forty pixels, not fifty six. */
  .title {
    font-family: var(--display);
    font-stretch: 75%;
    font-variation-settings: "opsz" 96;
    font-weight: 800;
    font-size: 40px;
    line-height: 1.05;
    letter-spacing: .006em;
    margin: 0;
  }

  .quiet {
    color: var(--muted);
    font-size: 14px;
    margin: 0;
  }

  .help {
    font-size: 12.5px;
    color: var(--muted);
    margin: 0;
    max-width: 62ch;
  }

  .help.wide,
  .careful {
    max-width: 74ch;
  }

  /* A warning is a sentence in the warning colour, never a tinted box. */
  .careful {
    font-size: 13px;
    color: var(--warn);
    margin: 0;
  }

  .wrong {
    color: var(--danger);
  }

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
    background: none;
    border: 0;
    padding: 0 0 8px;
    margin-bottom: -9px;
    min-height: 32px;
    color: var(--muted);
    cursor: pointer;
    position: relative;
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
  .check:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 4px;
  }

  .tabbody {
    display: grid;
    gap: 20px;
    align-content: start;
  }

  .group {
    display: grid;
    gap: 12px;
    align-content: start;
  }

  .tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
  }

  .tools.left {
    justify-content: flex-start;
  }

  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 20px;
  }

  .check {
    font: inherit;
    font-size: 14.5px;
    background: none;
    border: 0;
    padding: 0;
    gap: 10px;
    color: var(--ink);
    cursor: pointer;
  }

  .check[aria-pressed="false"] span {
    color: var(--muted);
  }

  /*
   * The one container: the well colour, cut at fourteen pixels, the way the
   * board's panel is drawn on the event page.
   */
  .panel {
    background: var(--well);
    padding: 20px 22px;
    display: grid;
    gap: 16px;
    justify-items: start;
  }

  .panel.under {
    margin-bottom: 6px;
  }

  .panel h2,
  .tools h2,
  .group h2 {
    font-family: var(--display);
    font-stretch: 75%;
    font-weight: 800;
    font-size: 22px;
    line-height: 1.1;
    margin: 0;
  }

  .panel h3 {
    font-family: var(--display);
    font-stretch: 75%;
    font-weight: 800;
    font-size: 18px;
    line-height: 1.1;
    margin: 0;
  }

  /* ── Listings, built the way the exam listing is built ─────────────────── */

  .listing {
    display: grid;
    width: 100%;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 18px;
    padding: 12px 0;
    border-top: 1px solid var(--line);
  }

  .midterms .row {
    display: grid;
    grid-template-columns: 130px minmax(0, 1.2fr) 160px minmax(0, 1fr) 110px auto;
    align-items: start;
  }

  .runs .row {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr)) minmax(0, 1.4fr);
    align-items: baseline;
    font-size: 13px;
  }

  .row.head {
    border-top: 0;
    font-family: var(--display);
    font-stretch: 85%;
    font-weight: 700;
    font-size: 12.5px;
    color: var(--muted);
    padding-bottom: 4px;
  }

  .ttl {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
    min-width: 0;
  }

  .midterms .ttl {
    display: grid;
    gap: 3px;
  }

  .ttl .name {
    font-family: var(--display);
    font-stretch: 90%;
    font-weight: 700;
    font-size: 16px;
  }

  .ttl code.name {
    font-family: var(--mono);
    font-size: 14px;
  }

  .ttl small,
  .midterms small,
  .counts {
    font-size: 12.5px;
    color: var(--muted);
  }

  .counts {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
  }

  .midterms .code {
    font-family: var(--display);
    font-stretch: 75%;
    font-weight: 800;
    font-size: 24px;
    line-height: 1;
  }

  .midterms .code small,
  .midterms .tm small {
    display: block;
    font-family: var(--sans);
    font-weight: 400;
    font-stretch: 100%;
    margin-top: 4px;
  }

  .midterms .tm {
    font-family: var(--display);
    font-stretch: 75%;
    font-weight: 700;
    font-size: 18px;
    line-height: 1.1;
  }

  .midterms .tm small {
    font-family: var(--mono);
    font-size: 12px;
  }

  .midterms .rm {
    font-family: var(--mono);
    font-size: 13px;
    color: var(--muted);
    overflow-wrap: anywhere;
  }

  .midterms .st {
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
    max-width: 40ch;
  }

  .said {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--danger);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    margin: 0 0 8px;
    padding: 8px 0 0;
  }

  code {
    font-family: var(--mono);
    font-size: 12.5px;
  }

  .line {
    font-size: 13px;
    overflow-wrap: anywhere;
  }

  /* ── Fields ────────────────────────────────────────────────────────────── */

  .pair {
    display: flex;
    flex-wrap: wrap;
    gap: 16px 26px;
  }

  .adding {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 16px 22px;
  }

  .panel :global(.fld.wide),
  .tabbody :global(.fld.wide) {
    max-width: 560px;
  }

  .fld .in select {
    font: inherit;
    font-size: 16px;
    border: 0;
    color: var(--ink);
    outline: 0;
    padding: 2px 0;
  }

  .swatch {
    width: 44px;
    height: 28px;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
    flex: none;
  }

  .hex {
    font-family: var(--mono);
    font-size: 13px;
    color: var(--muted);
  }

  @media (max-width: 900px) {
    .midterms .row,
    .runs .row {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .runs .row.head {
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
