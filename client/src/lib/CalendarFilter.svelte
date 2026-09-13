<script>
	import { createEventDispatcher } from 'svelte';
	import { Button, Field, Highlight, Pad } from './components/ui/index.js';
	import { organizationColor } from './organizationColor.js';
	import { tagHue } from './tagHue.js';
	import { resolvedTheme } from '../stores/theme.js';

	/**
	 * The calendar's filter rail.
	 *
	 * A rail of words rather than a panel: headings in the condensed display
	 * face, a field for the search, highlighters for the tags, a pad and a name
	 * for each organization, and a pad for each thing the calendar can be asked
	 * to leave out. The rail is also the calendar's legend, which is why the grid
	 * beside it carries no row of coloured squares. See docs/design/08-surfaces.md.
	 */
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

	function toggleMidterms() {
		localShowMidterms = !localShowMidterms;
		notifyChange();
	}

	function toggleInternal() {
		localShowInternal = !localShowInternal;
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

	/**
	 * An organization's colour is stored as its board gave it and never drawn
	 * that way, so every mark on the rail goes through the adaptation first.
	 * See docs/design/04-color.md.
	 */
	$: markOf = rso => organizationColor(rso.logo_color, 'mark', $resolvedTheme);

	/**
	 * With nothing chosen the calendar shows every organization, so every mark is
	 * filled. Choosing one hollows the rest, which is how the rail says what the
	 * grid beside it is leaving out without relying on colour to say it.
	 */
	$: narrowed = localSelectedRsoIds.length > 0;

	let panelOpen = false;
</script>

<aside class="rail">
	<!-- On a phone the rail folds away, because the grid is what was opened. -->
	<button
		type="button"
		class="btn quiet opener"
		aria-expanded={panelOpen}
		aria-controls="calendar-filters"
		aria-label={isFilterActive ? 'Filters, some of them on' : undefined}
		on:click={() => panelOpen = !panelOpen}
	>
		<Pad lit={isFilterActive} />Filters
	</button>

	<div id="calendar-filters" class="groups" class:open={panelOpen}>
		<div class="group">
			<Field
				label="Search"
				value={localKeyword}
				placeholder="Keyword"
				oninput={handleKeywordInput}
			/>
		</div>

		<div class="group">
			<h4>Tags</h4>
			<div class="hlrow">
				{#each tags as tag}
					<Highlight
						tone={tagHue(tag)}
						off={!localSelectedTags.includes(tag)}
						pressed={localSelectedTags.includes(tag)}
						onclick={() => toggleTag(tag)}
					>{tag}</Highlight>
				{/each}
			</div>
		</div>

		{#if rsos.length > 0}
			<div class="group">
				<h4>Organizations</h4>
				<div class="orgs">
					{#each rsos as rso}
						<button
							type="button"
							class="org"
							aria-pressed={localSelectedRsoIds.includes(rso.rso_id)}
							on:click={() => toggleRso(rso.rso_id)}
						>
							<Pad
								tone={markOf(rso)}
								hollow={narrowed && !localSelectedRsoIds.includes(rso.rso_id)}
							/><span>{rso.name}</span>
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<div class="group">
			<h4>Show</h4>
			<div class="shows">
				<button
					type="button"
					class="check"
					aria-pressed={localShowMidterms}
					on:click={toggleMidterms}
				><Pad hollow={!localShowMidterms} />Midterms</button>
				<button
					type="button"
					class="check"
					aria-pressed={localShowInternal}
					on:click={toggleInternal}
				><Pad hollow={!localShowInternal} />Internal events</button>
			</div>
		</div>

		{#if isFilterActive}
			<div class="group">
				<Button variant="quiet" size="sm" onclick={clearFilters}>Clear the filters</Button>
			</div>
		{/if}
	</div>
</aside>

<style>
	.groups {
		display: grid;
		gap: 26px;
		align-content: start;
	}

	.hlrow {
		font-size: 14px;
	}

	.orgs {
		display: grid;
		font-size: 14px;
	}

	/*
	 * A pad and a name, inside a target a hand can hit. The button brings a look
	 * of its own that is not wanted here.
	 */
	.org,
	.check {
		font: inherit;
		background: none;
		border: 0;
		padding: 0;
		margin: 0;
		color: inherit;
		text-align: left;
		min-height: 32px;
		display: inline-flex;
		align-items: center;
		gap: 10px;
		cursor: pointer;
	}

	.org[aria-pressed="true"] span {
		font-weight: 600;
	}

	.org:focus-visible,
	.check:focus-visible,
	.opener:focus-visible {
		outline: 2px solid var(--primary);
		outline-offset: 4px;
	}

	.shows {
		display: grid;
		font-size: 14.5px;
	}

	/* The opener belongs to the phone, where the rail folds away. */
	.opener {
		display: none;
	}

	@media (max-width: 768px) {
		.opener {
			display: inline-flex;
			justify-self: start;
		}

		.groups {
			display: none;
		}

		.groups.open {
			display: grid;
		}
	}
</style>
