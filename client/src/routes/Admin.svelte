<script>
  import { onMount } from 'svelte';
  import { navigate } from 'svelte-routing';
  import { isGlobalAdmin } from '../stores/auth.js';
  import { getRsos, getRso, createRso, updateRso, addMember, removeMember } from '../api/rsos.js';
  import { getAdminUsers, createAdminUser, updateAdminUser, resetAdminPassword, deleteAdminUser } from '../api/admin.js';
  import { showToast } from '../stores/ui.js';

  // ── Access control ────────────────────────────────────────────────────────
  $: if (!$isGlobalAdmin) navigate('/');

  // ── Tab state ─────────────────────────────────────────────────────────────
  let activeTab = 'rsos';

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

  // ── Load users when tab activates ─────────────────────────────────────────
  $: if (activeTab === 'users' && !usersLoaded) loadUsers();

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
                  <div class="flex gap-2 ml-4 flex-shrink-0">
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
                  </div>
                </div>

                <!-- Edit RSO panel -->
                {#if editingRsoId === rso.rso_id}
                  <div class="border-t px-4 py-4 space-y-4 bg-muted/30">
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
                  <div class="border-t px-4 py-4 space-y-4 bg-muted/30">
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
                            <option value="Board">Board</option>
                            <option value="Admin">Admin</option>
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
                  <div class="border-t px-4 py-4 space-y-4 bg-muted/30">
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
                  <div class="border-t px-4 py-4 space-y-4 bg-muted/30">
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

  </div>
{/if}
