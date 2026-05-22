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
		/** Desktop renders full stage tabs; mobile renders compact workspace + active-stage chips. */
		variant?: "desktop" | "mobile";
		/** Monospace workspace path (`mkh / fulcrum · auth-rewrite`). */
		workspacePath?: string;
		/** Active WorkflowStage; drives the stage navigation + `data-active-stage`. */
		activeStage?: WorkflowStage;
		stages?: WorkflowStage[];
		onSelectStage?: (stage: WorkflowStage) => void;
		/** TraceBadge slot: the consumer passes a `<TraceChip badge />`. */
		trace?: Snippet;
		/** System icon cluster slot (palette, notifications, display, help, avatar). */
		systemCluster?: Snippet;
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		brand = "Fulcrum",
		variant = "desktop",
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

	const activeStageLabel = $derived(STAGE_LABEL[activeStage]);
</script>

<header
	bind:this={ref}
	aria-label="Scope bar"
	data-slot="scope-bar"
	data-scope-bar=""
	data-variant={variant}
	data-active-stage={activeStage}
	class={cn(
		"flex items-center border-b border-border bg-surface-elevated text-sm",
		variant === "mobile"
			? "h-14 w-full max-w-full gap-2 overflow-hidden px-3"
			: "h-12 gap-3 px-4",
		className,
	)}
	{...restProps}
>
	<span data-slot="scope-bar-brand" class="flex min-w-0 shrink-0 items-center gap-2 font-semibold text-fg">
		<span aria-hidden="true" class="grid size-6 place-items-center rounded-sm bg-accent text-primary-foreground"
			>⚡</span
		>
		<span class={cn(variant === "mobile" && "sr-only")}>{brand}</span>
	</span>

	{#if variant === "mobile"}
		<div data-slot="scope-bar-mobile-summary" class="flex min-w-0 flex-1 items-center gap-2">
			{#if workspacePath}
				<span
					data-slot="scope-bar-workspace-chip"
					class="min-w-0 truncate rounded-sm border border-border bg-surface px-2 py-1 font-mono text-[11px] text-fg-subtle"
					title={workspacePath}
				>
					{workspacePath}
				</span>
			{/if}
			<span
				data-slot="scope-bar-active-stage-chip"
				data-stage={activeStage}
				data-active="true"
				class="shrink-0 rounded-sm bg-accent px-2 py-1 text-xs font-medium text-primary-foreground"
			>
				{activeStageLabel}
			</span>
		</div>
	{:else}
		{#if workspacePath}
			<span data-slot="scope-bar-workspace" class="font-mono text-xs text-fg-subtle"
				>{workspacePath}</span
			>
		{/if}

		<nav data-slot="scope-bar-stages" aria-label="Stages" class="flex items-center gap-1">
			{#each stages as stage (stage)}
				{@const active = activeStage === stage}
				<button
					type="button"
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
	{/if}

	{#if trace && variant !== "mobile"}
		<span data-slot="scope-bar-trace">{@render trace()}</span>
	{/if}

	{#if systemCluster}
		<div data-slot="scope-bar-system" class="flex shrink-0 items-center gap-1">
			{@render systemCluster()}
		</div>
	{/if}
</header>
