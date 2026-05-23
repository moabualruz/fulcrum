<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../../utils.js";
	import type { WorkflowStatus } from "../status-badge/status-badge.svelte";

	export type TaskRowProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
		taskKey: string;
		title: string;
		status: WorkflowStatus;
		assignee?: string;
		priority?: "P0" | "P1" | "P2" | "P3" | "P4";
		estimate?: number;
		selected?: boolean;
		href?: string;
		onSelectToggle?: (next: boolean) => void;
	};
</script>

<script lang="ts">
	import StatusBadge from "../status-badge/status-badge.svelte";

	let {
		ref = $bindable(null),
		taskKey,
		title,
		status,
		assignee,
		priority,
		estimate,
		selected = $bindable(false),
		href,
		onSelectToggle,
		class: className,
		...restProps
	}: TaskRowProps = $props();

	function handleCheckbox(event: Event & { currentTarget: HTMLInputElement }) {
		selected = event.currentTarget.checked;
		onSelectToggle?.(selected);
	}
</script>

<div
	bind:this={ref}
	data-slot="task-row"
	data-task-key={taskKey}
	data-status={status}
	data-selected={selected ? "true" : undefined}
	class={cn(
		"grid grid-cols-[auto_5rem_1fr_auto_auto_auto] items-center gap-3 border-b border-border px-3 py-2 text-sm",
		selected && "bg-muted/40",
		className,
	)}
	{...restProps}
>
	<input
		type="checkbox"
		aria-label="Select task"
		data-slot="task-row-select"
		checked={selected}
		onchange={handleCheckbox}
		class="size-4 rounded border-input"
	/>
	<span data-slot="task-row-key" class="font-mono text-xs text-muted-foreground">{taskKey}</span>
	{#if href}
		<a
			href={href}
			data-slot="task-row-title"
			class="truncate text-foreground hover:underline focus-visible:underline focus-visible:outline-none"
		>
			{title}
		</a>
	{:else}
		<span data-slot="task-row-title" class="truncate text-foreground">{title}</span>
	{/if}
	{#if priority}
		<span
			data-slot="task-row-priority"
			data-priority={priority}
			class="rounded-md border border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
		>
			{priority}
		</span>
	{:else}
		<span aria-hidden="true"></span>
	{/if}
	{#if assignee}
		<span data-slot="task-row-assignee" class="text-xs text-muted-foreground">{assignee}</span>
	{:else}
		<span aria-hidden="true"></span>
	{/if}
	<div class="flex items-center gap-2">
		{#if typeof estimate === "number"}
			<span data-slot="task-row-estimate" class="text-xs tabular-nums text-muted-foreground">
				{estimate}h
			</span>
		{/if}
		<StatusBadge {status} />
	</div>
</div>
