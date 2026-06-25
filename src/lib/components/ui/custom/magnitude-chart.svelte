<script>
	import { untrack } from 'svelte';
	import { cn } from '$lib/utils.js';
	import BackgroundCard from '$lib/components/ui/patterns/background-card/index.js';
	import { Button } from '$lib/components/ui/primitives/button/index.js';
	import ActivityIcon from '@lucide/svelte/icons/activity';
	import GlobeIcon from '@lucide/svelte/icons/globe';
	import ZoomInIcon from '@lucide/svelte/icons/zoom-in';
	import ZoomOutIcon from '@lucide/svelte/icons/zoom-out';
	import MaximizeIcon from '@lucide/svelte/icons/maximize';
	import Maximize2Icon from '@lucide/svelte/icons/maximize-2';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import XIcon from '@lucide/svelte/icons/x';
	import InfoIcon from '@lucide/svelte/icons/info';
	import { LAND_PATHS } from '$lib/data/world-land.js';

	let {
		earthquakes = [],
		selectedId = $bindable(null),
		onexpand,
		class: className,
		...restProps
	} = $props();

	let view = $state('chart');

	const SIGNIFICANT = 4.5; // magnitude threshold for emphasis

	let sorted = $derived(
		[...earthquakes]
			.sort((a, b) => a.time - b.time)
			.map((eq) => ({ ...eq, date: new Date(eq.time) }))
	);

	let latestTime = $derived(sorted.length ? sorted[sorted.length - 1].time : Date.now());
	let newestId = $derived(sorted.length ? sorted[sorted.length - 1].id : null);

	// Selected earthquake (works for both views) — drives the detail bar so the
	// USGS link is reachable even in fullscreen, where only one panel is shown.
	let selectedEq = $derived(selectedId != null ? sorted.find((e) => e.id === selectedId) : null);

	// Shared color/size helpers
	function dotColor(mag) {
		if (mag >= 5) return 'var(--color-atai-critical)';
		if (mag >= 4) return 'var(--color-atai-warning)';
		if (mag >= 2.5) return 'var(--color-atai-neutral)';
		return 'var(--color-muted-foreground)';
	}

	function dotRadius(mag) {
		return Math.max(2, Math.min(8, mag * 1.5));
	}

	// Fade older events so the live feed visibly "breathes" — newest are bright.
	function ageOpacity(t) {
		const ageH = (latestTime - t) / 3600000;
		return Math.max(0.25, 0.9 - (ageH / 24) * 0.6);
	}

	// --- Chart view (dynamic sizing to avoid circle distortion) ---
	let chartContainer = $state(null);
	let CW = $state(600);
	let CH = $state(300);
	const CPAD = { top: 10, right: 10, bottom: 25, left: 35 };
	let cPlotW = $derived(CW - CPAD.left - CPAD.right);
	let cPlotH = $derived(CH - CPAD.top - CPAD.bottom);

	$effect(() => {
		if (!chartContainer) return;
		const ro = new ResizeObserver((entries) => {
			const { width, height } = entries[0].contentRect;
			if (width > 0 && height > 0) {
				CW = width;
				CH = height;
			}
		});
		ro.observe(chartContainer);
		return () => ro.disconnect();
	});

	let xMin = $derived(sorted.length ? sorted[0].time : Date.now() - 86400000);
	let xMax = $derived(sorted.length ? sorted[sorted.length - 1].time : Date.now());
	let yMax = $derived(Math.max(6, ...sorted.map((e) => e.mag || 0)) + 0.5);

	function xScale(t) {
		return CPAD.left + ((t - xMin) / (xMax - xMin || 1)) * cPlotW;
	}
	function yScale(m) {
		return CPAD.top + cPlotH - (m / yMax) * cPlotH;
	}

	let yTicks = $derived(
		Array.from({ length: Math.ceil(yMax) + 1 }, (_, i) => i).filter((v) => v <= yMax)
	);

	function formatTime(ts) {
		return new Date(ts).toLocaleTimeString('en-US', {
			hour12: false,
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// --- Map view (equirectangular, matches pre-projected land paths at 580x250) ---
	const LAND_W = 580;
	const LAND_H = 250;

	let mapContainer = $state(null);
	let MW = $state(580);
	let MH = $state(250);

	$effect(() => {
		if (!mapContainer) return;
		const ro = new ResizeObserver((entries) => {
			const { width, height } = entries[0].contentRect;
			if (width > 0 && height > 0) {
				MW = width;
				MH = height;
				// Reset view when container resizes
				vbW = MW;
				vbH = MH;
				vbX = 0;
				vbY = 0;
			}
		});
		ro.observe(mapContainer);
		return () => ro.disconnect();
	});

	// Uniform "fit-to-contain" scale so the equirectangular map keeps its aspect
	// ratio (no stretch/squish in non-2.32:1 panels) and is centered with margins.
	let mapS = $derived(Math.min(MW / LAND_W, MH / LAND_H) || 1);
	let mapOX = $derived((MW - LAND_W * mapS) / 2);
	let mapOY = $derived((MH - LAND_H * mapS) / 2);

	// Drop degenerate land paths — full-width hairline slivers in the bundled data
	// that otherwise render as black bars across the map.
	// The bundled data merges many continents into one closed path, stitched by
	// long "connector" segments that jump across the map (edge-to-edge), which
	// render as black bars/diagonals. Treat each path as a cycle, cut it at those
	// long segments, and re-emit the pieces as properly closed sub-loops — so the
	// connectors disappear without leaving an open chain (which would fill as a
	// diagonal). Paths with no long segments are returned unchanged.
	const JUMP = 40; // world units; real coastline steps are < ~15
	function sanitizePath(d) {
		const pts = [];
		for (const m of d.matchAll(/[ML]([\d.]+),([\d.]+)/g)) pts.push([+m[1], +m[2]]);
		const n = pts.length;
		if (n < 3) return d;
		const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
		const cuts = [];
		for (let i = 0; i < n; i++) if (dist(pts[i], pts[(i + 1) % n]) > JUMP) cuts.push(i);
		if (cuts.length === 0) return d;
		const arcs = [];
		for (let c = 0; c < cuts.length; c++) {
			const start = (cuts[c] + 1) % n;
			const end = cuts[(c + 1) % cuts.length];
			const arc = [];
			let i = start;
			while (true) {
				arc.push(pts[i]);
				if (i === end) break;
				i = (i + 1) % n;
			}
			if (arc.length >= 2) arcs.push(arc);
		}
		return arcs.map((a) => 'M' + a.map((p) => p.join(',')).join('L') + 'Z').join('');
	}

	const LAND = LAND_PATHS.filter((d) => {
		const n = (d.match(/[\d.]+/g) ?? []).map(Number);
		let minX = Infinity,
			maxX = -Infinity,
			minY = Infinity,
			maxY = -Infinity;
		for (let i = 0; i + 1 < n.length; i += 2) {
			if (n[i] < minX) minX = n[i];
			if (n[i] > maxX) maxX = n[i];
			if (n[i + 1] < minY) minY = n[i + 1];
			if (n[i + 1] > maxY) maxY = n[i + 1];
		}
		// drop full-width hairline slivers outright
		return !(maxX - minX > LAND_W * 0.6 && maxY - minY < 4);
	}).map(sanitizePath);

	function lonToX(lon) {
		return mapOX + ((lon + 180) / 360) * LAND_W * mapS;
	}
	function latToY(lat) {
		return mapOY + ((90 - lat) / 180) * LAND_H * mapS;
	}

	// Pan & zoom state
	let vbX = $state(0);
	let vbY = $state(0);
	let vbW = $state(580);
	let vbH = $state(250);
	let dragging = $state(false);
	let dragStart = $state({ x: 0, y: 0, vbX: 0, vbY: 0 });
	let dragDist = $state(0);
	let mapSvg = $state(null);

	// Screen-constant scale factor: a world length L renders at L/k screen px,
	// so multiply screen sizes by k to keep them constant through zoom.
	let k = $derived(vbW / MW || 1);

	// Map points with projected coords.
	let mapPoints = $derived(
		sorted
			.filter((e) => e.lon != null && e.lat != null)
			.map((e) => ({ ...e, x: lonToX(e.lon), y: latToY(e.lat) }))
	);

	// Grid clustering — merge points within ~CELL screen px; clusters split as you
	// zoom in (cell shrinks with k). Depends only on zoom, so panning is stable.
	const CELL_PX = 22;
	let clusters = $derived.by(() => {
		const cell = CELL_PX * k;
		if (!cell || mapPoints.length === 0) return [];
		const grid = {};
		for (const eq of mapPoints) {
			const key = `${Math.floor(eq.x / cell)},${Math.floor(eq.y / cell)}`;
			let c = grid[key];
			if (!c) {
				c = { items: [], sx: 0, sy: 0, maxMag: 0, latest: 0 };
				grid[key] = c;
			}
			c.items.push(eq);
			c.sx += eq.x;
			c.sy += eq.y;
			c.maxMag = Math.max(c.maxMag, eq.mag || 0);
			c.latest = Math.max(c.latest, eq.time);
		}
		return Object.values(grid).map((c) => {
			const x = c.sx / c.items.length;
			const y = c.sy / c.items.length;
			// Spread = farthest item from the centroid (world units). Near-zero means
			// the points are effectively coincident and zooming will never split them.
			let spread = 0;
			for (const it of c.items) {
				const d = Math.hypot(it.x - x, it.y - y);
				if (d > spread) spread = d;
			}
			return {
				x,
				y,
				count: c.items.length,
				maxMag: c.maxMag,
				latest: c.latest,
				spread,
				items: c.items
			};
		});
	});

	let clusterBubbles = $derived(clusters.filter((c) => c.count > 1));
	// Singletons drawn smallest-first so larger magnitudes land on top (fix z-order).
	let singleDots = $derived(
		clusters
			.filter((c) => c.count === 1)
			.map((c) => c.items[0])
			.sort((a, b) => (a.mag || 0) - (b.mag || 0))
	);

	let selectedPoint = $derived(
		selectedId != null ? mapPoints.find((e) => e.id === selectedId) : null
	);

	// "Spiderfy" — a small cluster fanned out around its centroid so co-located
	// quakes (e.g. repeated events at the same Japan coordinates, which never
	// separate by zooming) become individually clickable. Larger clusters zoom.
	let spider = $state(null);
	const SPIDER_MAX = 10;

	// Legend is collapsed by default so it never blocks the map; toggled by the ⓘ.
	let showLegend = $state(false);

	function clusterRadius(count) {
		return (7 + Math.min(8, Math.log2(count + 1) * 1.8)) * k;
	}

	function resetView() {
		spider = null;
		vbX = 0;
		vbY = 0;
		vbW = MW;
		vbH = MH;
	}

	function zoomBy(factor, cx, cy) {
		spider = null;
		const newW = Math.max(40, Math.min(MW, vbW * factor));
		const newH = Math.max(17, Math.min(MH, vbH * factor));
		const scaleX = newW / vbW;
		const scaleY = newH / vbH;
		vbX = cx - (cx - vbX) * scaleX;
		vbY = cy - (cy - vbY) * scaleY;
		vbW = newW;
		vbH = newH;
		clampView();
	}

	function clampView() {
		vbX = Math.max(-MW * 0.2, Math.min(MW - vbW + MW * 0.2, vbX));
		vbY = Math.max(-MH * 0.2, Math.min(MH - vbH + MH * 0.2, vbY));
	}

	function svgPoint(e) {
		if (!mapSvg) return { x: vbX + vbW / 2, y: vbY + vbH / 2 };
		const rect = mapSvg.getBoundingClientRect();
		return {
			x: vbX + ((e.clientX - rect.left) / rect.width) * vbW,
			y: vbY + ((e.clientY - rect.top) / rect.height) * vbH
		};
	}

	function handleWheel(e) {
		e.preventDefault();
		const pt = svgPoint(e);
		const factor = e.deltaY > 0 ? 1.15 : 0.87;
		zoomBy(factor, pt.x, pt.y);
	}

	function handlePointerDown(e) {
		if (e.button !== 0) return;
		dragging = true;
		dragDist = 0;
		dragStart = { x: e.clientX, y: e.clientY, vbX, vbY };
		e.currentTarget.setPointerCapture(e.pointerId);
	}

	function handlePointerMove(e) {
		if (!dragging || !mapSvg) return;
		dragDist += Math.abs(e.movementX) + Math.abs(e.movementY);
		const rect = mapSvg.getBoundingClientRect();
		const dx = ((e.clientX - dragStart.x) / rect.width) * vbW;
		const dy = ((e.clientY - dragStart.y) / rect.height) * vbH;
		vbX = dragStart.vbX - dx;
		vbY = dragStart.vbY - dy;
		clampView();
	}

	function handlePointerUp(e) {
		dragging = false;
		if (dragDist >= 5) return; // was a drag, not a click
		const target = document.elementFromPoint(e.clientX, e.clientY);
		const id = target?.getAttribute?.('data-id');
		if (id) {
			selectedId = selectedId === id ? null : id; // toggle selection
			spider = null;
			return;
		}
		// Cluster click → small clusters fan out (so co-located quakes are
		// clickable); larger clusters zoom in to split apart.
		const ci = target?.getAttribute?.('data-ci');
		if (ci != null) {
			const c = clusterBubbles[+ci];
			if (c) {
				// Fan out small clusters, or any cluster whose points are effectively
				// coincident (zooming wouldn't separate them); otherwise zoom in.
				if (c.count <= SPIDER_MAX || c.spread < 0.75) {
					spider = spider && spider.x === c.x && spider.y === c.y ? null : c;
				} else {
					zoomBy(0.5, c.x, c.y);
				}
			}
			return;
		}
		spider = null; // clicked empty space
	}

	// When a selection arrives (e.g. from the list) center it if it's off-screen.
	// untrack the view state so panning/zooming doesn't re-trigger this.
	$effect(() => {
		const id = selectedId;
		if (id == null || view !== 'map') return;
		untrack(() => {
			const p = mapPoints.find((e) => e.id === id);
			if (!p) return;
			if (p.x < vbX || p.x > vbX + vbW || p.y < vbY || p.y > vbY + vbH) {
				vbX = p.x - vbW / 2;
				vbY = p.y - vbH / 2;
				clampView();
			}
		});
	});
</script>

<BackgroundCard
	title="Magnitude"
	icon={ActivityIcon}
	class={cn('flex max-h-full flex-col gap-3 overflow-hidden', className)}
	{...restProps}
>
	<div class="flex items-center gap-1">
		<Button
			variant={view === 'chart' ? 'default' : 'outline'}
			size="sm"
			onclick={() => (view = 'chart')}
		>
			<ActivityIcon class="size-3" aria-hidden="true" />
			Timeline
		</Button>
		<Button
			variant={view === 'map' ? 'default' : 'outline'}
			size="sm"
			onclick={() => (view = 'map')}
		>
			<GlobeIcon class="size-3" aria-hidden="true" />
			Map
		</Button>
		{#if onexpand}
			<div class="ml-auto">
				<Button variant="ghost" size="icon-sm" aria-label="Fullscreen" onclick={onexpand}>
					<Maximize2Icon class="size-3.5" />
				</Button>
			</div>
		{/if}
	</div>

	{#if selectedEq}
		<div
			class="flex items-center gap-2 rounded-xs border border-border bg-accent/40 px-2 py-1.5 text-xs"
		>
			<span
				class="rounded px-1.5 py-0.5 font-mono text-[10px] text-black/70"
				style="background:{dotColor(selectedEq.mag || 0)}"
			>
				M{selectedEq.mag?.toFixed(1)}
			</span>
			<span class="min-w-0 flex-1 truncate text-foreground">{selectedEq.place}</span>
			<span class="font-mono text-[10px] whitespace-nowrap text-muted-foreground">
				{selectedEq.depth?.toFixed(1)}km
			</span>
			{#if selectedEq.url}
				<!-- eslint-disable svelte/no-navigation-without-resolve -- external USGS URL -->
				<a
					href={selectedEq.url}
					target="_blank"
					rel="noopener"
					class="inline-flex items-center gap-1 whitespace-nowrap text-primary hover:underline"
				>
					USGS <ExternalLinkIcon class="size-3" />
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
			<button
				onclick={() => (selectedId = null)}
				aria-label="Clear selection"
				class="text-muted-foreground hover:text-foreground"
			>
				<XIcon class="size-3.5" />
			</button>
		</div>
	{/if}

	{#if sorted.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">No data</p>
	{:else if view === 'chart'}
		<div bind:this={chartContainer} class="min-h-0 w-full flex-1">
			<svg viewBox="0 0 {CW} {CH}" width={CW} height={CH}>
				{#each yTicks as tick (tick)}
					<line
						x1={CPAD.left}
						y1={yScale(tick)}
						x2={CW - CPAD.right}
						y2={yScale(tick)}
						stroke="var(--color-border)"
						stroke-width="0.5"
					/>
					<text
						x={CPAD.left - 6}
						y={yScale(tick) + 3}
						text-anchor="end"
						fill="var(--color-muted-foreground)"
						font-size="9"
						font-family="var(--font-mono)"
					>
						M{tick}
					</text>
				{/each}

				{#each [xMin, xMin + (xMax - xMin) / 2, xMax] as ts (ts)}
					<text
						x={xScale(ts)}
						y={CH - 5}
						text-anchor="middle"
						fill="var(--color-muted-foreground)"
						font-size="9"
						font-family="var(--font-mono)"
					>
						{formatTime(ts)}
					</text>
				{/each}

				{#each sorted as eq (eq.id)}
					<circle
						cx={xScale(eq.time)}
						cy={yScale(eq.mag || 0)}
						r={dotRadius(eq.mag || 0)}
						fill={dotColor(eq.mag || 0)}
						opacity={selectedId && selectedId !== eq.id ? 0.25 : 0.7}
						stroke={selectedId === eq.id ? 'var(--color-foreground)' : 'none'}
						stroke-width={selectedId === eq.id ? 1.5 : 0}
						class={eq.url ? 'cursor-pointer hover:opacity-100' : ''}
						role="button"
						tabindex="-1"
						onclick={() => (selectedId = selectedId === eq.id ? null : eq.id)}
					>
						<title>M{eq.mag?.toFixed(1)} - {eq.place}</title>
					</circle>
				{/each}
			</svg>
		</div>
	{:else}
		<div bind:this={mapContainer} class="relative min-h-0 flex-1">
			<svg
				bind:this={mapSvg}
				viewBox="{vbX} {vbY} {vbW} {vbH}"
				class="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing"
				width={MW}
				height={MH}
				onwheel={handleWheel}
				onpointerdown={handlePointerDown}
				onpointermove={handlePointerMove}
				onpointerup={handlePointerUp}
				onpointerleave={handlePointerUp}
			>
				<!-- Ocean background -->
				<rect x={-MW} y={-MH} width={MW * 3} height={MH * 3} fill="var(--color-card)" />

				<!-- Land masses (pre-projected to 580x250, uniformly scaled + centered) -->
				<g transform="translate({mapOX}, {mapOY}) scale({mapS}, {mapS})">
					{#each LAND as d (d)}
						<path
							{d}
							fill="var(--color-muted)"
							stroke="var(--color-border)"
							stroke-width={Math.max(0.2, 0.3 * k)}
						/>
					{/each}
				</g>

				<!-- Cluster bubbles (count > 1): small ones fan out, larger ones zoom -->
				{#each clusterBubbles as c, ci (c.x + ',' + c.y)}
					<circle
						cx={c.x}
						cy={c.y}
						r={clusterRadius(c.count)}
						fill={dotColor(c.maxMag)}
						opacity="0.35"
						stroke={dotColor(c.maxMag)}
						stroke-width={k}
						class={c.count <= SPIDER_MAX ? 'cursor-pointer' : 'cursor-zoom-in'}
						data-ci={ci}
					/>
					<text
						x={c.x}
						y={c.y + 3 * k}
						text-anchor="middle"
						fill="var(--color-foreground)"
						font-size={9 * k}
						font-family="var(--font-mono)"
						class="pointer-events-none"
					>
						{c.count}
					</text>
				{/each}

				<!-- Single dots (smallest first → larger magnitudes on top) -->
				{#each singleDots as eq (eq.id)}
					{#if (eq.mag || 0) >= SIGNIFICANT || eq.id === newestId}
						<!-- pulse ring for significant events + the newest event -->
						<circle
							cx={eq.x}
							cy={eq.y}
							r={dotRadius(eq.mag || 0) * k}
							fill="none"
							stroke={eq.id === newestId ? 'var(--color-foreground)' : dotColor(eq.mag || 0)}
							stroke-width={1.2 * k}
							class="pointer-events-none"
						>
							<animate
								attributeName="r"
								values="{dotRadius(eq.mag || 0) * k};{dotRadius(eq.mag || 0) * k * 3.2}"
								dur="1.8s"
								repeatCount="indefinite"
							/>
							<animate attributeName="opacity" values="0.7;0" dur="1.8s" repeatCount="indefinite" />
						</circle>
					{/if}
					<circle
						cx={eq.x}
						cy={eq.y}
						r={dotRadius(eq.mag || 0) * k}
						fill={dotColor(eq.mag || 0)}
						opacity={selectedId && selectedId !== eq.id ? 0.2 : ageOpacity(eq.time)}
						stroke={(eq.mag || 0) >= SIGNIFICANT ? 'var(--color-background)' : 'none'}
						stroke-width={(eq.mag || 0) >= SIGNIFICANT ? 0.6 * k : 0}
						class="cursor-pointer"
						data-id={eq.id}
					>
						<title>M{eq.mag?.toFixed(1)} - {eq.place} (depth {eq.depth?.toFixed(1)}km)</title>
					</circle>
				{/each}

				<!-- Spiderfied cluster: fan its members out so each is clickable -->
				{#if spider}
					{#each spider.items as it, i (it.id)}
						{@const ang = (i / spider.items.length) * Math.PI * 2}
						{@const rad = (16 + spider.items.length * 1.5) * k}
						{@const sx = spider.x + Math.cos(ang) * rad}
						{@const sy = spider.y + Math.sin(ang) * rad}
						<line
							x1={spider.x}
							y1={spider.y}
							x2={sx}
							y2={sy}
							stroke="var(--color-border)"
							stroke-width={k}
							class="pointer-events-none"
						/>
						<circle
							cx={sx}
							cy={sy}
							r={(dotRadius(it.mag || 0) + 1) * k}
							fill={dotColor(it.mag || 0)}
							stroke="var(--color-background)"
							stroke-width={0.8 * k}
							class="cursor-pointer"
							data-id={it.id}
						>
							<title>M{it.mag?.toFixed(1)} - {it.place} (depth {it.depth?.toFixed(1)}km)</title>
						</circle>
					{/each}
				{/if}

				<!-- Selected point drawn on top with an accent ring -->
				{#if selectedPoint}
					<circle
						cx={selectedPoint.x}
						cy={selectedPoint.y}
						r={(dotRadius(selectedPoint.mag || 0) + 4) * k}
						fill="none"
						stroke="var(--color-primary)"
						stroke-width={1.6 * k}
						class="pointer-events-none"
					/>
					<circle
						cx={selectedPoint.x}
						cy={selectedPoint.y}
						r={dotRadius(selectedPoint.mag || 0) * k}
						fill={dotColor(selectedPoint.mag || 0)}
						opacity="1"
						class="cursor-pointer"
						data-id={selectedPoint.id}
					>
						<title
							>M{selectedPoint.mag?.toFixed(1)} - {selectedPoint.place} (depth {selectedPoint.depth?.toFixed(
								1
							)}km)</title
						>
					</circle>
				{/if}
			</svg>

			<!-- Magnitude legend (collapsed by default so it never blocks the map) -->
			<div class="absolute bottom-2 left-2 flex flex-col items-start gap-1">
				{#if showLegend}
					<div
						class="flex flex-col gap-0.5 rounded-xs border border-border bg-card/80 px-2 py-1.5 font-mono text-[10px] text-muted-foreground backdrop-blur-sm"
					>
						<span class="flex items-center gap-1.5">
							<span class="inline-block size-2 rounded-full bg-atai-critical"></span> M5+
						</span>
						<span class="flex items-center gap-1.5">
							<span class="inline-block size-2 rounded-full bg-atai-warning"></span> M4–5
						</span>
						<span class="flex items-center gap-1.5">
							<span class="inline-block size-2 rounded-full bg-atai-neutral"></span> M2.5–4
						</span>
						<span class="flex items-center gap-1.5">
							<span class="inline-block size-1.5 rounded-full bg-muted-foreground"></span> &lt;2.5
						</span>
						<span class="mt-0.5 flex items-center gap-1.5 border-t border-border pt-1">
							<span class="inline-block size-2 rounded-full border border-foreground"></span> pulsing
							= M≥4.5 / newest
						</span>
					</div>
				{/if}
				<Button
					variant="outline"
					size="icon-sm"
					aria-label={showLegend ? 'Hide legend' : 'Show legend'}
					onclick={() => (showLegend = !showLegend)}
				>
					<InfoIcon class="size-3.5" />
				</Button>
			</div>

			<!-- Zoom controls -->
			<div class="absolute right-2 bottom-2 flex gap-1">
				<Button
					variant="outline"
					size="icon-sm"
					aria-label="Zoom in"
					onclick={() => zoomBy(0.7, vbX + vbW / 2, vbY + vbH / 2)}
				>
					<ZoomInIcon class="size-3.5" />
				</Button>
				<Button
					variant="outline"
					size="icon-sm"
					aria-label="Zoom out"
					onclick={() => zoomBy(1.4, vbX + vbW / 2, vbY + vbH / 2)}
				>
					<ZoomOutIcon class="size-3.5" />
				</Button>
				<Button variant="outline" size="icon-sm" aria-label="Reset zoom" onclick={resetView}>
					<MaximizeIcon class="size-3.5" />
				</Button>
			</div>
		</div>
	{/if}
</BackgroundCard>
