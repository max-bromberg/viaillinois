<script>
  import { onMount } from 'svelte';
  import { navigate } from '../lib/router.js';
  import { isGlobalAdmin } from '../stores/auth.js';
  import { getRsos, getRso, createRso, updateRso, deleteRso, addMember, removeMember } from '../api/rsos.js';
  import { getAdminUsers, createAdminUser, updateAdminUser, resetAdminPassword, deleteAdminUser, getPollStatus, getPollHistory, getUnknownCodes, triggerPoll } from '../api/admin.js';
  import { showToast } from '../stores/ui.js';
  import { getAdminMidterms, updateMidtermStatus } from '../api/midterms.js';

  // ── Access control ────────────────────────────────────────────────────────
  $: if (!$isGlobalAdmin) navigate('/');

  // ── Tab state ─────────────────────────────────────────────────────────────
  let activeTab = 'rsos';

  // ── Midterms tab state ────────────────────────────────────────────────────
  let midterms = [];
  let midtermsLoading = false;
  let midtermsLoaded = false;
  let midtermsStatusFilter = 'Pending';

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

  async function handleDeleteUser(netId) {
    if (!confirm('Delete user ' + netId + '?')) return;
    try {
      await deleteAdminUser(netId);
      showToast('User deleted');
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

  // ── Data Sources functions ────────────────────────────────────────────────

  function relativeTime(isoStr) {
    if (!isoStr) return '—';
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  function runDuration(startedAt, finishedAt) {
    if (!startedAt || !finishedAt) return '—';
    const ms = new Date(finishedAt) - new Date(startedAt);
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }

  function statusBadge(run) {
    if (!run) return { label: 'Never run', cls: 'bg-muted text-muted-foreground' };
    if (!run.finished_at) return { label: 'In flight', cls: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400' };
    if (run.error_count > 0) return { label: 'Error', cls: 'bg-destructive/10 text-destructive' };
    return { label: 'OK', cls: 'bg-teal-500/20 text-teal-700 dark:text-teal-400' };
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
      showToast('Copied to clipboard');
    } catch {
      showToast('Copy failed — select text manually', 'error');
    }
  }

  const SERVICE_LABELS = { courses: 'Course Explorer', facilities: 'Facilities (Tableau)', astra: 'Ad Astra' };
  const ALL_SERVICES = Object.keys(SERVICE_LABELS);

  // ── Init ──────────────────────────────────────────────────────────────────
  onMount(() => {
    loadRsos();
  });
</script>

{#if !$isGlobalAdmin}
  <div class="flex items-center justify-center min-h-[60vh]">
    <p class="text-muted-foreground">Redirecting…</p>
  </div>
{:else}
  <div class="max-w-5xl mx-auto px-4 py-8 space-y-6">

    <!-- Page header -->
    <h1 class="text-2xl font-bold">Admin</h1>

    <!-- Tab bar -->
    <div class="flex gap-2 border-b pb-1 mb-4">
      <button
        class="px-4 py-1.5 text-sm font-medium rounded-t transition-colors {activeTab === 'rsos' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}"
        on:click={() => activeTab = 'rsos'}
      >RSOs</button>
      <button
        class="px-4 py-1.5 text-sm font-medium rounded-t transition-colors {activeTab === 'users' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}"
        on:click={() => activeTab = 'users'}
      >Users</button>
      <button
        class="px-4 py-1.5 text-sm font-medium rounded-t transition-colors {activeTab === 'midterms' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}"
        on:click={() => activeTab = 'midterms'}
      >Midterms</button>
      <button
        class="px-4 py-1.5 text-sm font-medium rounded-t transition-colors {activeTab === 'dataSources' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}"
        on:click={() => activeTab = 'dataSources'}
      >Data Sources</button>
    </div>

    <!-- ── RSOs Tab ───────────────────────────────────────────────────── -->
    {#if activeTab === 'rsos'}
      <div class="space-y-4">

        <!-- Toolbar -->
        <div class="flex items-center justify-between">
          <p class="text-sm text-muted-foreground">
            {rsosLoading ? 'Loading…' : `${rsos.length} RSO${rsos.length !== 1 ? 's' : ''}`}
          </p>
          <button
            class="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            on:click={() => { showCreateRsoForm = !showCreateRsoForm; }}
          >
            {showCreateRsoForm ? 'Cancel' : '+ New RSO'}
          </button>
        </div>

        <!-- Create RSO form -->
        {#if showCreateRsoForm}
          <section class="border rounded-lg p-5 bg-card shadow-sm space-y-4 mt-2">
            <h2 class="text-base font-semibold">New RSO</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div class="space-y-1">
                <label class="text-xs text-muted-foreground">Name</label>
                <input
                  class="w-full border rounded-md px-3 py-1.5 text-sm bg-background"
                  placeholder="RSO name"
                  bind:value={rsoForm.name}
                />
              </div>
              <div class="space-y-1">
                <label class="text-xs text-muted-foreground">Founded Year</label>
                <input
                  class="w-full border rounded-md px-3 py-1.5 text-sm bg-background"
                  type="number"
                  placeholder="e.g. 2018"
                  bind:value={rsoForm.founded_year}
                />
              </div>
              <div class="space-y-1 sm:col-span-2">
                <label class="text-xs text-muted-foreground">Description</label>
                <input
                  class="w-full border rounded-md px-3 py-1.5 text-sm bg-background"
                  placeholder="Short description"
                  bind:value={rsoForm.description}
                />
              </div>
              <div class="space-y-1">
                <label class="text-xs text-muted-foreground">Logo Color</label>
                <div class="flex items-center gap-2">
                  <input
                    type="color"
                    class="h-8 w-12 rounded border cursor-pointer"
                    bind:value={rsoForm.logo_color}
                  />
                  <span class="text-sm text-muted-foreground">{rsoForm.logo_color}</span>
                </div>
              </div>
            </div>
            <div>
              <button
                class="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                on:click={handleCreateRso}
              >Save</button>
              <button
                class="px-3 py-1.5 text-sm border border-input rounded-md hover:bg-accent transition-colors ml-2"
                on:click={() => { showCreateRsoForm = false; rsoForm = { name: '', description: '', logo_color: '#000000', founded_year: '' }; }}
              >Cancel</button>
            </div>
          </section>
        {/if}

        <!-- RSO list -->
        {#if rsosLoading}
          <p class="text-sm text-muted-foreground py-4">Loading RSOs…</p>
        {:else if rsos.length === 0}
          <p class="text-sm text-muted-foreground py-4">No RSOs yet.</p>
        {:else}
          <div class="space-y-2">
            {#each rsos as rso (rso.rso_id)}
              <div class="border rounded-lg bg-card shadow-sm">
                <!-- Row -->
                <div class="flex items-center justify-between px-4 py-3">
                  <div class="flex items-center min-w-0">
                    <span
                      class="inline-block w-4 h-4 rounded-sm mr-2 flex-shrink-0"
                      style="background-color: {rso.logo_color || '#888'}"
                    ></span>
                    <span class="font-medium text-sm truncate">{rso.name}</span>
                    {#if rso.founded_year}
                      <span class="ml-2 text-xs text-muted-foreground">est. {rso.founded_year}</span>
                    {/if}
                  </div>
                  <div class="flex gap-2 ml-4 flex-shrink-0 flex-wrap">
                    <button
                      class="px-3 py-1.5 text-xs border border-input rounded-md hover:bg-accent transition-colors
                        {editingRsoId === rso.rso_id ? 'bg-accent' : ''}"
                      on:click={() => {
                        if (editingRsoId === rso.rso_id) { editingRsoId = null; }
                        else { startEditRso(rso); }
                      }}
                    >
                      {editingRsoId === rso.rso_id ? 'Close' : 'Edit'}
                    </button>
                    <button
                      class="px-3 py-1.5 text-xs border border-input rounded-md hover:bg-accent transition-colors
                        {managingRsoId === rso.rso_id ? 'bg-accent' : ''}"
                      on:click={() => startManageMembers(rso.rso_id)}
                    >
                      {managingRsoId === rso.rso_id ? 'Close Members' : 'Manage Members'}
                    </button>
                    {#if confirmDeleteRsoId === rso.rso_id}
                      <span class="flex items-center gap-1.5">
                        <span class="text-xs text-destructive font-medium">Delete RSO?</span>
                        <button
                          class="px-2.5 py-1.5 text-xs bg-destructive text-white rounded-md hover:bg-destructive/90 transition-colors"
                          on:click={() => handleDeleteRso(rso.rso_id)}
                        >Yes, delete</button>
                        <button
                          class="px-2.5 py-1.5 text-xs border border-input rounded-md hover:bg-accent transition-colors"
                          on:click={() => confirmDeleteRsoId = null}
                        >Cancel</button>
                      </span>
                    {:else}
                      <button
                        class="px-3 py-1.5 text-xs border border-destructive/50 text-destructive rounded-md hover:bg-destructive/10 transition-colors"
                        on:click={() => { confirmDeleteRsoId = rso.rso_id; editingRsoId = null; managingRsoId = null; }}
                      >Delete</button>
                    {/if}
                  </div>
                </div>

                <!-- Edit RSO panel -->
                {#if editingRsoId === rso.rso_id}
                  <div class="border-t px-4 py-4 space-y-4 bg-card">
                    <h3 class="text-sm font-semibold">Edit RSO</h3>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div class="space-y-1">
                        <label class="text-xs text-muted-foreground">Name</label>
                        <input
                          class="w-full border rounded-md px-3 py-1.5 text-sm bg-background"
                          bind:value={rsoForm.name}
                        />
                      </div>
                      <div class="space-y-1">
                        <label class="text-xs text-muted-foreground">Founded Year</label>
                        <input
                          class="w-full border rounded-md px-3 py-1.5 text-sm bg-background"
                          type="number"
                          bind:value={rsoForm.founded_year}
                        />
                      </div>
                      <div class="space-y-1 sm:col-span-2">
                        <label class="text-xs text-muted-foreground">Description</label>
                        <input
                          class="w-full border rounded-md px-3 py-1.5 text-sm bg-background"
                          bind:value={rsoForm.description}
                        />
                      </div>
                      <div class="space-y-1">
                        <label class="text-xs text-muted-foreground">Logo Color</label>
                        <div class="flex items-center gap-2">
                          <input
                            type="color"
                            class="h-8 w-12 rounded border cursor-pointer"
                            bind:value={rsoForm.logo_color}
                          />
                          <span class="text-sm text-muted-foreground">{rsoForm.logo_color}</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <button
                        class="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                        on:click={() => handleUpdateRso(rso.rso_id)}
                      >Save</button>
                      <button
                        class="px-3 py-1.5 text-sm border border-input rounded-md hover:bg-accent transition-colors ml-2"
                        on:click={() => editingRsoId = null}
                      >Cancel</button>
                    </div>
                  </div>
                {/if}

                <!-- Manage Members panel -->
                {#if managingRsoId === rso.rso_id}
                  <div class="border-t px-4 py-4 space-y-4 bg-card">
                    <h3 class="text-sm font-semibold">
                      Members
                      {#if managingRsoDetail}
                        <span class="text-muted-foreground font-normal">({managingRsoDetail.members?.length ?? 0})</span>
                      {/if}
                    </h3>

                    {#if membersLoading}
                      <p class="text-sm text-muted-foreground">Loading members…</p>
                    {:else if managingRsoDetail}
                      <!-- Members list -->
                      {#if managingRsoDetail.members && managingRsoDetail.members.length > 0}
                        <div class="space-y-1">
                          {#each managingRsoDetail.members as member (member.net_id)}
                            <div class="flex items-center justify-between py-1.5 px-3 rounded-md hover:bg-accent/50 transition-colors">
                              <div class="min-w-0">
                                <span class="text-sm font-medium">{member.full_name}</span>
                                <span class="text-xs text-muted-foreground ml-2">{member.net_id}</span>
                                <span class="text-xs text-muted-foreground ml-1">· {member.role}</span>
                              </div>
                              <button
                                class="ml-4 px-2 py-1 text-xs border border-destructive/50 text-destructive rounded-md hover:bg-destructive/10 transition-colors flex-shrink-0"
                                on:click={() => handleRemoveMember(rso.rso_id, member.net_id)}
                              >Remove</button>
                            </div>
                          {/each}
                        </div>
                      {:else}
                        <p class="text-sm text-muted-foreground">No members yet.</p>
                      {/if}

                      <!-- Add member form -->
                      <div class="pt-2 border-t space-y-2">
                        <p class="text-xs font-medium text-muted-foreground">Add Member</p>
                        <div class="flex gap-2 flex-wrap">
                          <input
                            class="border rounded-md px-3 py-1.5 text-sm bg-background flex-1 min-w-32"
                            placeholder="NetID"
                            bind:value={memberForm.netId}
                          />
                          <select
                            class="border rounded-md px-3 py-1.5 text-sm bg-background"
                            bind:value={memberForm.role}
                          >
                            <option value="Member">Member</option>
                            <option value="Editor">Editor</option>
                            <option value="Board">Board</option>
                          </select>
                          <button
                            class="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                            on:click={() => handleAddMember(rso.rso_id)}
                          >Add</button>
                        </div>
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- ── Users Tab ──────────────────────────────────────────────────── -->
    {#if activeTab === 'users'}
      <div class="space-y-4">

        <!-- Toolbar -->
        <div class="flex items-center justify-between">
          <p class="text-sm text-muted-foreground">
            {usersLoading ? 'Loading…' : `${users.length} user${users.length !== 1 ? 's' : ''}`}
          </p>
          <button
            class="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            on:click={() => { showCreateUserForm = !showCreateUserForm; }}
          >
            {showCreateUserForm ? 'Cancel' : '+ New User'}
          </button>
        </div>

        <!-- Create user form -->
        {#if showCreateUserForm}
          <section class="border rounded-lg p-5 bg-card shadow-sm space-y-4 mt-2">
            <h2 class="text-base font-semibold">New Admin User</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div class="space-y-1">
                <label class="text-xs text-muted-foreground">NetID</label>
                <input
                  class="w-full border rounded-md px-3 py-1.5 text-sm bg-background"
                  placeholder="e.g. jsmith3"
                  bind:value={userForm.net_id}
                />
              </div>
              <div class="space-y-1">
                <label class="text-xs text-muted-foreground">Full Name</label>
                <input
                  class="w-full border rounded-md px-3 py-1.5 text-sm bg-background"
                  placeholder="Jane Smith"
                  bind:value={userForm.full_name}
                />
              </div>
              <div class="space-y-1">
                <label class="text-xs text-muted-foreground">Email</label>
                <input
                  class="w-full border rounded-md px-3 py-1.5 text-sm bg-background"
                  type="email"
                  placeholder="jsmith3@illinois.edu"
                  bind:value={userForm.email}
                />
              </div>
              <div class="space-y-1">
                <label class="text-xs text-muted-foreground">Password</label>
                <input
                  class="w-full border rounded-md px-3 py-1.5 text-sm bg-background"
                  type="password"
                  placeholder="Initial password"
                  bind:value={userForm.password}
                />
              </div>
            </div>
            <div>
              <button
                class="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                on:click={handleCreateUser}
              >Save</button>
              <button
                class="px-3 py-1.5 text-sm border border-input rounded-md hover:bg-accent transition-colors ml-2"
                on:click={() => { showCreateUserForm = false; userForm = { net_id: '', full_name: '', email: '', password: '' }; }}
              >Cancel</button>
            </div>
          </section>
        {/if}

        <!-- Users list -->
        {#if usersLoading}
          <p class="text-sm text-muted-foreground py-4">Loading users…</p>
        {:else if users.length === 0}
          <p class="text-sm text-muted-foreground py-4">No admin users yet.</p>
        {:else}
          <div class="space-y-2">
            {#each users as user (user.net_id)}
              <div class="border rounded-lg bg-card shadow-sm">
                <!-- Row -->
                <div class="flex items-center justify-between px-4 py-3 flex-wrap gap-2">
                  <div class="min-w-0">
                    <span class="font-medium text-sm">{user.full_name}</span>
                    <span class="ml-2 text-xs text-muted-foreground">{user.net_id}</span>
                    <span class="ml-2 text-xs text-muted-foreground">{user.email}</span>
                  </div>
                  <div class="flex gap-2 flex-shrink-0">
                    <button
                      class="px-3 py-1.5 text-xs border border-input rounded-md hover:bg-accent transition-colors
                        {editingNetId === user.net_id ? 'bg-accent' : ''}"
                      on:click={() => {
                        if (editingNetId === user.net_id) { editingNetId = null; }
                        else { startEditUser(user); }
                      }}
                    >
                      {editingNetId === user.net_id ? 'Close' : 'Edit'}
                    </button>
                    <button
                      class="px-3 py-1.5 text-xs border border-input rounded-md hover:bg-accent transition-colors
                        {resettingNetId === user.net_id ? 'bg-accent' : ''}"
                      on:click={() => {
                        if (resettingNetId === user.net_id) { resettingNetId = null; }
                        else { startResetPassword(user.net_id); }
                      }}
                    >
                      {resettingNetId === user.net_id ? 'Close' : 'Reset Password'}
                    </button>
                    <button
                      class="px-3 py-1.5 text-xs border border-destructive/50 text-destructive rounded-md hover:bg-destructive/10 transition-colors"
                      on:click={() => handleDeleteUser(user.net_id)}
                    >Delete</button>
                  </div>
                </div>

                <!-- Edit user panel -->
                {#if editingNetId === user.net_id}
                  <div class="border-t px-4 py-4 space-y-4 bg-card">
                    <h3 class="text-sm font-semibold">Edit User</h3>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div class="space-y-1">
                        <label class="text-xs text-muted-foreground">Full Name</label>
                        <input
                          class="w-full border rounded-md px-3 py-1.5 text-sm bg-background"
                          bind:value={editUserForm.full_name}
                        />
                      </div>
                      <div class="space-y-1">
                        <label class="text-xs text-muted-foreground">Email</label>
                        <input
                          class="w-full border rounded-md px-3 py-1.5 text-sm bg-background"
                          type="email"
                          bind:value={editUserForm.email}
                        />
                      </div>
                    </div>
                    <div>
                      <button
                        class="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                        on:click={() => handleUpdateUser(user.net_id)}
                      >Save</button>
                      <button
                        class="px-3 py-1.5 text-sm border border-input rounded-md hover:bg-accent transition-colors ml-2"
                        on:click={() => editingNetId = null}
                      >Cancel</button>
                    </div>
                  </div>
                {/if}

                <!-- Reset password panel -->
                {#if resettingNetId === user.net_id}
                  <div class="border-t px-4 py-4 space-y-4 bg-card">
                    <h3 class="text-sm font-semibold">Reset Password</h3>
                    <div class="space-y-1 max-w-sm">
                      <label class="text-xs text-muted-foreground">New Password</label>
                      <input
                        class="w-full border rounded-md px-3 py-1.5 text-sm bg-background"
                        type="password"
                        placeholder="New password"
                        bind:value={passwordForm.password}
                      />
                    </div>
                    <div>
                      <button
                        class="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                        on:click={() => handleResetPassword(user.net_id)}
                      >Save</button>
                      <button
                        class="px-3 py-1.5 text-sm border border-input rounded-md hover:bg-accent transition-colors ml-2"
                        on:click={() => resettingNetId = null}
                      >Cancel</button>
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- ── Midterms Tab ──────────────────────────────────────────────────── -->
    {#if activeTab === 'midterms'}
      <div class="space-y-4">
        <!-- Status filter pills -->
        <div class="flex items-center gap-2 flex-wrap">
          {#each ['Pending', 'Confirmed', 'Cancelled', 'All'] as f}
            {@const count = f === 'All' ? midterms.length : midterms.filter(m => (m.confirmation_status ?? 'Pending') === f).length}
            <button
              class="text-xs px-3 py-1 rounded-full border transition-colors
                {midtermsStatusFilter === f
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:bg-accent text-muted-foreground'}"
              on:click={() => midtermsStatusFilter = f}
            >{f} {#if !midtermsLoading}<span class="opacity-70">({count})</span>{/if}</button>
          {/each}
        </div>

        {#if midtermsLoading}
          <p class="text-sm text-muted-foreground py-4">Loading midterms…</p>
        {:else}
          {@const filtered = midtermsStatusFilter === 'All'
            ? midterms
            : midterms.filter(m => (m.confirmation_status ?? 'Pending') === midtermsStatusFilter)}
          {#if filtered.length === 0}
            <p class="text-sm text-muted-foreground py-4">
              {midterms.length === 0 ? 'No midterms submitted yet.' : `No ${midtermsStatusFilter.toLowerCase()} midterms.`}
            </p>
          {:else}
          <div class="space-y-2">
            {#each filtered as mt (mt.midterm_id)}
              <div class="border rounded-lg bg-card shadow-sm">
                <div class="flex items-start justify-between px-4 py-3 flex-wrap gap-3">
                  <!-- Details -->
                  <div class="min-w-0 space-y-1">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-medium text-sm">{mt.title}</span>
                      <span class="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{mt.course_code}</span>
                      {#if mt.course_title}
                        <span class="text-xs text-muted-foreground">{mt.course_title}</span>
                      {/if}
                      <span class="text-xs px-1.5 py-0.5 rounded
                        {mt.confirmation_status === 'Confirmed' ? 'bg-teal-500/20 text-teal-700 dark:text-teal-400' :
                         mt.confirmation_status === 'Cancelled' ? 'bg-destructive/10 text-destructive' :
                         'bg-muted text-muted-foreground'}">
                        {mt.confirmation_status ?? 'Pending'}
                      </span>
                    </div>
                    <div class="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                      <span>
                        {new Date(mt.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                        ·
                        {new Date(mt.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        –
                        {new Date(mt.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                      {#if mt.building}
                        <span>{mt.building} · {mt.room_number}</span>
                      {/if}
                      {#if mt.submitted_by}
                        <span>Submitted by <span class="font-medium text-foreground">{mt.submitted_by}</span></span>
                      {/if}
                      <span class="flex items-center gap-1">
                        <span class="text-foreground font-medium">{mt.score > 0 ? '+' : ''}{mt.score ?? 0}</span> votes
                      </span>
                    </div>
                  </div>
                  <!-- Actions -->
                  <div class="flex gap-2 flex-shrink-0 flex-wrap">
                    {#if mt.confirmation_status !== 'Confirmed'}
                      <button
                        class="px-3 py-1.5 text-xs bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors"
                        on:click={() => handleMidtermStatus(mt.midterm_id, 'Confirmed')}
                      >Confirm</button>
                    {/if}
                    {#if mt.confirmation_status !== 'Cancelled'}
                      <button
                        class="px-3 py-1.5 text-xs border border-destructive/50 text-destructive rounded-md hover:bg-destructive/10 transition-colors"
                        on:click={() => handleMidtermStatus(mt.midterm_id, 'Cancelled')}
                      >Cancel</button>
                    {/if}
                    {#if mt.confirmation_status === 'Cancelled' || mt.confirmation_status === 'Confirmed'}
                      <button
                        class="px-3 py-1.5 text-xs border border-input rounded-md hover:bg-accent transition-colors"
                        on:click={() => handleMidtermStatus(mt.midterm_id, 'Pending')}
                      >Reset</button>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
          {/if}
        {/if}
      </div>
    {/if}

    <!-- ── Data Sources Tab ──────────────────────────────────────────────── -->
    {#if activeTab === 'dataSources'}
      <div class="space-y-6">

        <!-- Run-now warning banner -->
        <div class="rounded-md border border-yellow-400/40 bg-yellow-50/50 dark:bg-yellow-900/10 px-4 py-2.5 text-xs text-yellow-800 dark:text-yellow-300">
          Manual runs are resource-intensive — trigger conservatively. The facilities poller uses a full Playwright browser session.
        </div>

        {#if pollLoading}
          <p class="text-sm text-muted-foreground">Loading…</p>
        {:else}
          <!-- Summary cards -->
          <div class="space-y-3">
            {#each ALL_SERVICES as service}
              {@const run = pollStatus.find(r => r.service === service) ?? null}
              {@const badge = statusBadge(run)}
              <div class="border rounded-lg bg-card shadow-sm">
                <!-- Card header row -->
                <div class="flex items-center justify-between px-4 py-3 flex-wrap gap-3">
                  <div class="flex items-center gap-3 min-w-0">
                    <span class="font-medium text-sm">{SERVICE_LABELS[service]}</span>
                    <span class="text-xs px-1.5 py-0.5 rounded font-medium {badge.cls}">{badge.label}</span>
                    {#if run}
                      <span class="text-xs text-muted-foreground">
                        {run.finished_at ? relativeTime(run.finished_at) : `started ${relativeTime(run.started_at)}`}
                      </span>
                    {/if}
                  </div>
                  <div class="flex items-center gap-2 flex-shrink-0">
                    {#if run}
                      <span class="text-xs text-muted-foreground">
                        {run.rows_processed} processed · {run.rows_skipped} skipped
                        {#if run.error_count > 0}
                          · <span class="text-destructive font-medium">{run.error_count} error{run.error_count !== 1 ? 's' : ''}</span>
                        {/if}
                      </span>
                    {/if}
                    <button
                      class="px-3 py-1.5 text-xs border border-input rounded-md hover:bg-accent transition-colors
                        {historyOpenFor === service ? 'bg-accent' : ''}"
                      on:click={() => loadHistory(service)}
                    >
                      {historyOpenFor === service ? 'Hide History' : 'History'}
                    </button>
                    <button
                      class="px-3 py-1.5 text-xs border border-input rounded-md hover:bg-accent transition-colors disabled:opacity-50"
                      disabled={triggeringService === service}
                      on:click={() => handleTrigger(service)}
                    >
                      {triggeringService === service ? 'Starting…' : 'Run now'}
                    </button>
                  </div>
                </div>

                <!-- Courses metadata -->
                {#if run?.metadata?.totalCourses != null}
                  <div class="border-t px-4 py-2 text-xs text-muted-foreground">
                    {run.metadata.totalCourses} courses · {run.metadata.totalSections} sections
                  </div>
                {/if}

                <!-- History panel -->
                {#if historyOpenFor === service}
                  <div class="border-t px-4 py-3">
                    {#if historyLoading && !historyData[service]}
                      <p class="text-sm text-muted-foreground">Loading history…</p>
                    {:else if !historyData[service] || historyData[service].length === 0}
                      <p class="text-sm text-muted-foreground">No history yet.</p>
                    {:else}
                      <div class="overflow-x-auto">
                        <table class="w-full text-xs">
                          <thead>
                            <tr class="text-left text-muted-foreground border-b">
                              <th class="pb-1 pr-4 font-medium">Started</th>
                              <th class="pb-1 pr-4 font-medium">Duration</th>
                              <th class="pb-1 pr-4 font-medium">Processed</th>
                              <th class="pb-1 pr-4 font-medium">Skipped</th>
                              <th class="pb-1 pr-4 font-medium">Errors</th>
                              <th class="pb-1 font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {#each historyData[service] as row (row.log_id)}
                              {@const rowBadge = statusBadge(row)}
                              <tr
                                class="border-b last:border-0 {row.error_count > 0 || !row.finished_at ? 'bg-destructive/5 cursor-pointer' : ''}"
                                on:click={() => {
                                  if (row.error_count > 0 || !row.finished_at) {
                                    expandedHistoryRow = { ...expandedHistoryRow, [row.log_id]: !expandedHistoryRow[row.log_id] };
                                  }
                                }}
                              >
                                <td class="py-1.5 pr-4">{new Date(row.started_at).toLocaleString()}</td>
                                <td class="py-1.5 pr-4">{runDuration(row.started_at, row.finished_at)}</td>
                                <td class="py-1.5 pr-4">{row.rows_processed}</td>
                                <td class="py-1.5 pr-4">{row.rows_skipped}</td>
                                <td class="py-1.5 pr-4 {row.error_count > 0 ? 'text-destructive font-medium' : ''}">{row.error_count}</td>
                                <td class="py-1.5">
                                  <span class="px-1.5 py-0.5 rounded text-xs {rowBadge.cls}">{rowBadge.label}</span>
                                </td>
                              </tr>
                              {#if expandedHistoryRow[row.log_id] && row.last_error}
                                <tr class="bg-destructive/5">
                                  <td colspan="6" class="px-2 pb-2">
                                    <pre class="text-xs text-destructive/80 whitespace-pre-wrap break-all">{row.last_error}</pre>
                                  </td>
                                </tr>
                              {/if}
                            {/each}
                          </tbody>
                        </table>
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>

          <!-- Unknown Building Codes -->
          <div class="space-y-3">
            <h2 class="text-base font-semibold">Unknown Building Codes</h2>
            {#if !unknownCodesLoaded}
              <p class="text-sm text-muted-foreground">Loading…</p>
            {:else if unknownCodes.length === 0}
              <p class="text-sm text-muted-foreground">No unknown building codes recorded.</p>
            {:else}
              <p class="text-xs text-muted-foreground">
                These codes were seen in poller data but are not in the static map in
                <code class="font-mono bg-muted px-1 rounded">server/lib/locationNormalizer.js</code>.
                Add the generated line to <code class="font-mono bg-muted px-1 rounded">BUILDING_CODE_MAP</code> in a future commit.
              </p>
              <div class="space-y-1.5">
                {#each unknownCodes as uc (uc.raw_code)}
                  <div class="border rounded-lg bg-card shadow-sm">
                    <div class="flex items-center justify-between px-4 py-2.5 flex-wrap gap-2">
                      <div class="flex items-center gap-4 min-w-0">
                        <code class="font-mono text-sm font-medium">{uc.raw_code}</code>
                        <span class="text-xs text-muted-foreground">
                          {uc.occurrences} occurrence{uc.occurrences !== 1 ? 's' : ''} · last seen {relativeTime(uc.last_seen)}
                        </span>
                      </div>
                      <button
                        class="px-3 py-1.5 text-xs border border-input rounded-md hover:bg-accent transition-colors
                          {mappingOpen[uc.raw_code] ? 'bg-accent' : ''}"
                        on:click={() => {
                          mappingOpen = { ...mappingOpen, [uc.raw_code]: !mappingOpen[uc.raw_code] };
                          if (!mappingFor[uc.raw_code]) mappingFor = { ...mappingFor, [uc.raw_code]: '' };
                        }}
                      >
                        {mappingOpen[uc.raw_code] ? 'Close' : 'Add mapping'}
                      </button>
                    </div>

                    {#if mappingOpen[uc.raw_code]}
                      <div class="border-t px-4 py-3 space-y-2 bg-muted/30">
                        <div class="flex items-center gap-2 flex-wrap">
                          <input
                            class="border rounded-md px-3 py-1.5 text-sm bg-background flex-1 min-w-48"
                            placeholder="Canonical building name, e.g. Natural Sciences Research Center"
                            bind:value={mappingFor[uc.raw_code]}
                          />
                        </div>
                        {#if mappingFor[uc.raw_code]?.trim()}
                          {@const codeLine = buildCodeLine(uc.raw_code, mappingFor[uc.raw_code])}
                          <div class="flex items-center gap-2 flex-wrap">
                            <code class="font-mono text-xs bg-muted px-3 py-1.5 rounded border flex-1 break-all">{codeLine}</code>
                            <button
                              class="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors flex-shrink-0"
                              on:click={() => copyToClipboard(codeLine)}
                            >Copy</button>
                          </div>
                          <p class="text-xs text-muted-foreground">
                            Add this line to <code class="font-mono bg-muted px-1 rounded">BUILDING_CODE_MAP</code> in
                            <code class="font-mono bg-muted px-1 rounded">server/lib/locationNormalizer.js</code>
                            and commit in a future update.
                          </p>
                        {/if}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

  </div>
{/if}
