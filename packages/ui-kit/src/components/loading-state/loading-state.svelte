<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../../utils.js";
	import Skeleton from "../skeleton/skeleton.svelte";

	export type LoadingStateDensity = "compact" | "regular";
	export type LoadingStateShape = "panel" | "feed" | "table";

	export type LoadingStateProps = WithElementRef<HTMLDivElement> & {
		title?: string;
		description?: string;
		density?: LoadingStateDensity;
		shape?: LoadingStateShape;
		rows?: number;
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		title = "Loading workbench",
		description = "Fetching current project state.",
		density = "regular",
		shape = "panel",
		rows = 4,
		class: className,
		...restProps
	}: LoadingStateProps = $props();

	const rowCount = $derived(Math.max(1, Math.min(rows, 8)));
	const compact = $derived(density === "compact");
</script>

<div
	bind:this={ref}
	data-slot="loading-state"
	data-state="loading"
	data-density={density}
	data-shape={shape}
	role="status"
	aria-live="polite"
	aria-busy="true"
	aria-label={title}
	class={cn(
		"grid gap-3 rounded-md border border-border bg-card p-4 text-foreground",
		compact ? "p-3" : "p-4",
		className,
	)}
	{...restProps}
>
	<div class="flex min-w-0 items-start gap-3">
		<span
			data-slot="loading-state-spinner"
			aria-hidden="true"
			class="mt-0.5 size-4 shrink-0 rounded-full border-2 border-muted border-t-primary motion-safe:animate-spin"
		></span>
		<div class="min-w-0 space-y-1">
			<p data-slot="loading-state-title" class="text-sm font-semibold text-foreground">{title}</p>
			{#if description}
				<p data-slot="loading-state-description" class="text-xs text-muted-foreground">{description}</p>
			{/if}
		</div>
	</div>

	<div data-slot="loading-state-skeletons" class={cn("grid gap-2", shape === "table" && "gap-1.5")}>
		{#if shape === "table"}
			<Skeleton shape="rect" height="1.75rem" class="fulcrum-loading-skeleton" />
			{#each Array.from({ length: rowCount }) as _, index (index)}
				<div class="grid grid-cols-[1fr_5rem_4rem] items-center gap-3 rounded-sm border border-border/60 px-2 py-1.5">
					<Skeleton shape="text" class="fulcrum-loading-skeleton" />
					<Skeleton shape="text" class="fulcrum-loading-skeleton" />
					<Skeleton shape="text" class="fulcrum-loading-skeleton" />
				</div>
			{/each}
		{:else if shape === "feed"}
			{#each Array.from({ length: rowCount }) as _, index (index)}
				<div class="grid grid-cols-[2rem_1fr] gap-3 rounded-sm border border-border/60 px-3 py-2">
					<Skeleton shape="circle" class="fulcrum-loading-skeleton size-8" />
					<div class="grid gap-2">
						<Skeleton shape="text" class="fulcrum-loading-skeleton" />
						<Skeleton shape="text" class="fulcrum-loading-skeleton max-w-[72%]" />
					</div>
				</div>
			{/each}
		{:else}
			<Skeleton shape="rect" height={compact ? "4rem" : "6rem"} class="fulcrum-loading-skeleton" />
			<Skeleton shape="text" lines={3} class="fulcrum-loading-skeleton" />
		{/if}
	</div>
</div>
