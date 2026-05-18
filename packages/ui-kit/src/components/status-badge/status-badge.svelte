<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../../utils.js";

	export type WorkflowStatus =
		| "queued"
		| "running"
		| "waiting-input"
		| "paused"
		| "completed"
		| "failed"
		| "blocked"
		| "cancelled"
		| "scheduled";

	const STATUS_LABEL: Record<WorkflowStatus, string> = {
		queued: "Queued",
		running: "Running",
		"waiting-input": "Waiting",
		paused: "Paused",
		completed: "Completed",
		failed: "Failed",
		blocked: "Blocked",
		cancelled: "Cancelled",
		scheduled: "Scheduled",
	};

	const STATUS_GLYPH: Record<WorkflowStatus, string> = {
		queued: "○",
		running: "●",
		"waiting-input": "◐",
		paused: "❚❚",
		completed: "✓",
		failed: "✕",
		blocked: "■",
		cancelled: "⊘",
		scheduled: "◇",
	};

	const STATUS_CLASS: Record<WorkflowStatus, string> = {
		queued: "bg-muted text-foreground",
		running: "bg-accent/15 text-accent-foreground",
		"waiting-input": "bg-warning/20 text-warning-foreground",
		paused: "bg-secondary text-secondary-foreground",
		completed: "bg-success/15 text-success",
		failed: "bg-destructive/15 text-destructive",
		blocked: "bg-destructive/15 text-destructive",
		cancelled: "bg-muted text-muted-foreground",
		scheduled: "bg-muted text-foreground",
	};

	export type StatusBadgeProps = WithElementRef<HTMLAttributes<HTMLSpanElement>> & {
		status: WorkflowStatus;
		hideLabel?: boolean;
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		status,
		hideLabel = false,
		class: className,
		...restProps
	}: StatusBadgeProps = $props();
</script>

<span
	bind:this={ref}
	data-slot="status-badge"
	data-status={status}
	role="status"
	aria-label={STATUS_LABEL[status]}
	class={cn(
		"inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
		STATUS_CLASS[status],
		className,
	)}
	{...restProps}
>
	<span aria-hidden="true" class="text-[10px] leading-none" data-status-glyph={status}>
		{STATUS_GLYPH[status]}
	</span>
	{#if hideLabel}
		<span class="sr-only">{STATUS_LABEL[status]}</span>
	{:else}
		<span>{STATUS_LABEL[status]}</span>
	{/if}
</span>
