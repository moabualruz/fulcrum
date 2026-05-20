<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import type { Snippet } from "svelte";
	import { cn, type WithElementRef } from "../../utils.js";
	import { WORKFLOW_STAGES, type WorkflowStage } from "../stage-rail/stage-rail.svelte";

	export type { WorkflowStage } from "../stage-rail/stage-rail.svelte";

	const STAGE_LABEL: Record<WorkflowStage, string> = {
		capture: "Capture",
		plan: "Plan",
		build: "Build",
		review: "Review",
		ship: "Ship",
		operate: "Operate",
	};

	export type ScopeBarProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
		/** Brand mark label rendered left of the workspace path. */
		brand?: string;
		/** Monospace workspace path (`mkh / fulcrum · auth-rewrite`). */
		workspacePath?: string;
		/** Active WorkflowStage; drives the stage tab strip + `data-active-stage`. */
		activeStage?: WorkflowStage;
		stages?: WorkflowStage[];
		onSelectStage?: (stage: WorkflowStage) => void;
		/** TraceBadge slot — the consumer passes a `<TraceChip badge />`. */
		trace?: Snippet;
		/** System icon cluster slot (palette · notifications · display · help · avatar). */
		systemCluster?: Snippet;
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		brand = "Fulcrum",
		workspacePath,
		activeStage = $bindable("capture"),
		stages = WORKFLOW_STAGES,
		onSelectStage,
		trace,
		systemCluster,
		class: className,
		...restProps
	}: ScopeBarProps = $props();

	function pick(stage: WorkflowStage) {
		activeStage = stage;
		onSelectStage?.(stage);
	}
</script>

<header
	bind:this={ref}
	role="banner"
	aria-label="Scope bar"
	data-slot="scope-bar"
	data-scope-bar=""
	data-active-stage={activeStage}
	class={cn(
		"flex h-12 items-center gap-3 border-b border-border bg-surface-elevated px-4 text-sm",
		className,
	)}
	{...restProps}
>
	<span data-slot="scope-bar-brand" class="flex items-center gap-2 font-semibold text-fg">
		<span aria-hidden="true" class="grid size-6 place-items-center rounded-sm bg-accent text-primary-foreground"
			>⚡</span
		>
		{brand}
	</span>

	{#if workspacePath}
		<span data-slot="scope-bar-workspace" class="font-mono text-xs text-fg-subtle"
			>{workspacePath}</span
		>
	{/if}

	<nav data-slot="scope-bar-stages" aria-label="Stage tabs" class="flex items-center gap-1">
		{#each stages as stage (stage)}
			{@const active = activeStage === stage}
			<button
				type="button"
				role="tab"
				aria-selected={active}
				aria-current={active ? "page" : undefined}
				data-slot="scope-bar-tab"
				data-stage={stage}
				data-active={active ? "true" : undefined}
				class={cn(
					"h-7 rounded-md px-3 text-xs font-medium transition-colors",
					active
						? "bg-accent text-primary-foreground"
						: "text-fg-subtle hover:bg-surface-sunken hover:text-fg",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				)}
				onclick={() => pick(stage)}
			>
				{STAGE_LABEL[stage]}
			</button>
		{/each}
	</nav>

	<span class="flex-1"></span>

	{#if trace}
		<span data-slot="scope-bar-trace">{@render trace()}</span>
	{/if}

	{#if systemCluster}
		<div data-slot="scope-bar-system" class="flex items-center gap-1">
			{@render systemCluster()}
		</div>
	{/if}
</header>
