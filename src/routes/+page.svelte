<script>
	import Menubar from '$lib/components/ui/patterns/menubar/index.js';
	import { Button } from '$lib/components/ui/primitives/button/index.js';
	import FeedSelector from '$lib/components/ui/custom/feed-selector.svelte';
	import StatsBar from '$lib/components/ui/custom/stats-bar.svelte';
	import MagnitudeChart from '$lib/components/ui/custom/magnitude-chart.svelte';
	import EarthquakeList from '$lib/components/ui/custom/earthquake-list.svelte';
	import ChatPanel from '$lib/components/ui/custom/chat-panel.svelte';
	import MinimizeIcon from '@lucide/svelte/icons/minimize-2';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import { fetchEarthquakes, analyzeEarthquakes } from '$lib/api/earthquakes.js';

	let selectedFeed = $state('all_day');
	let earthquakes = $state([]);
	let loading = $state(false);
	let chatMessages = $state([]);
	let chatLoading = $state(false);
	let intervalId = $state(null);
	let expanded = $state(null);
	let countdown = $state(60);
	let selectedId = $state(null); // shared between the map and the list

	async function loadData(feed) {
		loading = true;
		try {
			const data = await fetchEarthquakes(feed);
			earthquakes = data.earthquakes;
		} catch (err) {
			console.error('Failed to load earthquakes:', err);
		} finally {
			loading = false;
		}
	}

	function handleFeedChange(feed) {
		loadData(feed);
	}

	async function handleChatSend(text) {
		chatMessages = [
			...chatMessages,
			{ id: crypto.randomUUID(), role: 'user', text, timestamp: Date.now() }
		];
		chatLoading = true;

		try {
			const result = await analyzeEarthquakes(text, selectedFeed);
			chatMessages = [
				...chatMessages,
				{
					id: crypto.randomUUID(),
					role: 'assistant',
					text: result.analysis,
					timestamp: result.timestamp
				}
			];
		} catch (err) {
			chatMessages = [
				...chatMessages,
				{
					id: crypto.randomUUID(),
					role: 'assistant',
					text: `Error: ${err.message}`,
					timestamp: Date.now()
				}
			];
		} finally {
			chatLoading = false;
		}
	}

	function toggleExpand(panel) {
		expanded = expanded === panel ? null : panel;
	}

	$effect(() => {
		loadData(selectedFeed);
		countdown = 60;
		const id = setInterval(() => {
			countdown--;
			if (countdown <= 0) {
				loadData(selectedFeed);
				countdown = 60;
			}
		}, 1000);
		return () => clearInterval(id);
	});
</script>

{#snippet partnerSnippet()}
	<span class="font-mono text-sm tracking-wider text-muted-foreground uppercase"
		>Seismic Monitor</span
	>
{/snippet}

<div
	class="grid h-screen w-screen grid-rows-[auto_auto_1fr] overflow-hidden bg-background text-foreground"
>
	<Menubar partnerLogo={partnerSnippet}>
		<div class="flex items-center gap-4">
			<StatsBar {earthquakes} />
			<div class="flex items-center gap-1.5 text-xs text-muted-foreground">
				<RefreshCwIcon class="size-3" aria-hidden="true" />
				<span>Next update in <span class="font-mono text-foreground">{countdown}s</span></span>
			</div>
		</div>
	</Menubar>

	<div class="border-b border-border px-4 py-2">
		<FeedSelector bind:selected={selectedFeed} onchange={handleFeedChange} />
	</div>

	<main class="grid grid-cols-2 grid-rows-2 gap-4 overflow-hidden p-4">
		<MagnitudeChart
			{earthquakes}
			bind:selectedId
			onexpand={() => toggleExpand('magnitude')}
			class="max-h-full overflow-hidden"
		/>

		<ChatPanel
			bind:messages={chatMessages}
			loading={chatLoading}
			onsend={handleChatSend}
			class="row-span-2 max-h-full"
		/>

		<EarthquakeList
			{earthquakes}
			{loading}
			bind:selectedId
			onexpand={() => toggleExpand('earthquakes')}
			class="max-h-full"
		/>
	</main>
</div>

<!-- Fullscreen overlay -->
{#if expanded}
	<div class="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background">
		<div class="flex items-center justify-between border-b border-border px-4 py-2">
			<span class="font-mono text-sm tracking-wider text-foreground uppercase">
				{expanded === 'magnitude' ? 'Magnitude' : 'Earthquakes'}
			</span>
			<Button variant="outline" size="sm" onclick={() => (expanded = null)}>
				<MinimizeIcon class="size-3.5" />
				Close
			</Button>
		</div>
		<div class="min-h-0 flex-1 p-4">
			{#if expanded === 'magnitude'}
				<MagnitudeChart {earthquakes} bind:selectedId class="h-full" />
			{:else}
				<EarthquakeList {earthquakes} {loading} bind:selectedId class="h-full" />
			{/if}
		</div>
	</div>
{/if}
