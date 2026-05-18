<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../../utils.js";
	import type { WorkflowStatus } from "../status-badge/status-badge.svelte";

	export type RunFeedItemProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
		runId: string;
		taskTitle: string;
		taskKey?: string;
		agentName: string;
		status: WorkflowStatus;
		elapsed?: string;
		lastEvent?: string;
		href?: string;
	};
</script>

<script lang="ts">
	import StatusBadge from "../status-badge/status-badge.svelte";

	let {
		ref = $bindable(null),
		runId,
		taskTitle,
		taskKey,
		agentName,
		status,
		elapsed,
		lastEvent,
		href,
		class: className,
		...restProps
	}: RunFeedItemProps = $props();
</script>

<article
	bind:this={ref}
	data-slot="run-feed-item"
	data-run-id={runId}
	data-status={status}
	class={cn(
		"flex flex-col gap-2 border-b border-border px-4 py-3 transition-colors",
		"hover:bg-muted/30",
		className,
	)}
	{...restProps}
>
	<header class="flex flex-wrap items-center gap-2">
		{#if taskKey}
			<span data-slot="run-feed-item-key" class="font-mono text-xs text-muted-foreground">
				{taskKey}
			</span>
		{/if}
		{#if href}
			<a
				href={href}
				data-slot="run-feed-item-title"
				class="text-sm font-medium hover:underline focus-visible:outline-none focus-visible:underline"
			>
				{taskTitle}
			</a>
		{:else}
			<span data-slot="run-feed-item-title" class="text-sm font-medium">{taskTitle}</span>
		{/if}
		<StatusBadge {status} />
	</header>
	<footer class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
		<span data-slot="run-feed-item-agent">{agentName}</span>
		{#if elapsed}
			<span data-slot="run-feed-item-elapsed">{elapsed}</span>
		{/if}
		{#if lastEvent}
			<span data-slot="run-feed-item-last-event" class="truncate">{lastEvent}</span>
		{/if}
	</footer>
</article>
