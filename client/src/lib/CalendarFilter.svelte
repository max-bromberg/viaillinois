<script>
	import { createEventDispatcher } from 'svelte';

	export let keyword = '';
	export let selectedTags = [];
	export let rsos = [];
	export let selectedRsoIds = [];
	export let showMidterms = true;
	export let showInternal = false;

	const dispatch = createEventDispatcher();

	let localKeyword = keyword;
	let localSelectedTags = [...selectedTags];
	let localSelectedRsoIds = [...selectedRsoIds];
	let localShowMidterms = showMidterms;
	let localShowInternal = showInternal;

	$: localKeyword = keyword;
	$: localSelectedTags = [...selectedTags];
	$: localSelectedRsoIds = [...selectedRsoIds];
	$: localShowMidterms = showMidterms;
	$: localShowInternal = showInternal;

	const tags = ['Free Food', 'Workshop', 'Social', 'Corporate', 'Competition', 'Weekly Meeting', 'Speaker', 'Networking'];

	function notifyChange() {
		dispatch('change', {
			keyword: localKeyword,
			selectedTags: localSelectedTags,
			selectedRsoIds: localSelectedRsoIds,
			showMidterms: localShowMidterms,
			showInternal: localShowInternal
		});
	}

	function toggleTag(tag) {
		const index = localSelectedTags.indexOf(tag);
		if (index > -1) {
			localSelectedTags.splice(index, 1);
		} else {
			localSelectedTags.push(tag);
		}
		localSelectedTags = localSelectedTags;
		notifyChange();
	}

	function toggleRso(rsoId) {
		const index = localSelectedRsoIds.indexOf(rsoId);
		if (index > -1) {
			localSelectedRsoIds.splice(index, 1);
		} else {
			localSelectedRsoIds.push(rsoId);
		}
		localSelectedRsoIds = localSelectedRsoIds;
		notifyChange();
	}

	function handleKeywordInput(e) {
		localKeyword = e.target.value;
		notifyChange();
	}

	function toggleMidterms(e) {
		localShowMidterms = e.target.checked;
		notifyChange();
	}

	function toggleInternal(e) {
		localShowInternal = e.target.checked;
		notifyChange();
	}

	function clearFilters() {
		localKeyword = '';
		localSelectedTags = [];
		localSelectedRsoIds = [];
		localShowMidterms = true;
		localShowInternal = false;
		notifyChange();
	}

	$: isFilterActive = localKeyword || localSelectedTags.length > 0 || localSelectedRsoIds.length > 0 || !localShowMidterms || localShowInternal;

	let panelOpen = false;
</script>

<aside class="w-full md:w-56 md:shrink-0 bg-card rounded-lg border">
  <!-- Mobile toggle button -->
  <button
    class="md:hidden w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium"
    on:click={() => panelOpen = !panelOpen}
  >
    <span>Filters{#if isFilterActive} <span class="text-primary font-bold">·</span>{/if}</span>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      style="transition: transform 0.2s; transform: rotate({panelOpen ? 180 : 0}deg)">
      <path d="m6 9 6 6 6-6"/>
    </svg>
  </button>

  <div class="{panelOpen ? 'block' : 'hidden'} md:block p-3 space-y-4">
	<!-- Search -->
	<div>
		<input
			type="text"
			placeholder="Keyword…"
			value={localKeyword}
			on:input={handleKeywordInput}
			class="w-full px-2 py-1 text-sm border rounded bg-background text-foreground placeholder:text-muted-foreground"
		/>
	</div>

	<!-- Tags -->
	<div>
		<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Tags</div>
		<div class="flex flex-wrap gap-1">
			{#each tags as tag}
				<button
					on:click={() => toggleTag(tag)}
					class={`px-2 py-1 text-xs rounded-full border transition-colors ${
						localSelectedTags.includes(tag)
							? 'bg-primary text-primary-foreground border-primary'
							: 'border-border hover:bg-accent'
					}`}
				>
					{tag}
				</button>
			{/each}
		</div>
	</div>

	<!-- RSOs -->
	<div>
		<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">RSOs</div>
		<div class="space-y-1">
			{#each rsos as rso}
				<label class="flex items-center gap-1.5 text-xs cursor-pointer">
					<input
						type="checkbox"
						checked={localSelectedRsoIds.includes(rso.rso_id)}
						on:change={() => toggleRso(rso.rso_id)}
						class="w-3 h-3"
					/>
					<span
						class="w-2.5 h-2.5 rounded-sm flex-shrink-0 inline-block"
						style="background-color: {rso.logo_color || '#6b7280'};"
					></span>
					<span>{rso.name}</span>
				</label>
			{/each}
		</div>
	</div>

	<!-- Show -->
	<div>
		<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Show</div>
		<div class="space-y-1">
			<label class="flex items-center gap-1.5 text-xs cursor-pointer">
				<input
					type="checkbox"
					checked={localShowMidterms}
					on:change={toggleMidterms}
					class="w-3 h-3"
				/>
				<span>Midterms</span>
			</label>
			<label class="flex items-center gap-1.5 text-xs cursor-pointer">
				<input
					type="checkbox"
					checked={localShowInternal}
					on:change={toggleInternal}
					class="w-3 h-3"
				/>
				<span>Internal events</span>
			</label>
		</div>
	</div>

	<!-- Clear Button -->
	{#if isFilterActive}
		<button
			on:click={clearFilters}
			class="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
		>
			Clear filters
		</button>
	{/if}
  </div>
</aside>
