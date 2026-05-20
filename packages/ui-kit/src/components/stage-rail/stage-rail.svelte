<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../../utils.js";

	/** The six left-to-right WorkflowStages the StageRail navigates (DESIGN.md §3.1, IA-MAP.md §3). */
	export type WorkflowStage = "capture" | "plan" | "build" | "review" | "ship" | "operate";

	export const WORKFLOW_STAGES: WorkflowStage[] = [
		"capture",
		"plan",
		"build",
		"review",
		"ship",
		"operate",
	];

	const STAGE_LABEL: Record<WorkflowStage, string> = {
		capture: "Capture",
		plan: "Plan",
		build: "Build",
		review: "Review",
		ship: "Ship",
		operate: "Operate",
	};

	const STAGE_GLYPH: Record<WorkflowStage, string> = {
		capture: "✎",
		plan: "◇",
		build: "▢",
		review: "◷",
		ship: "▲",
		operate: "◉",
	};

	/** A System-group entry rendered below the stage divider (Settings · Knowledge · MCP · Plugins). */
	export type StageRailSystemItem = {
		id: string;
		label: string;
		glyph?: string;
		href?: string;
	};

	export type StageRailItem = {
		stage: WorkflowStage;
		href?: string;
		/** Optional mono count badge mirroring the OD rail (`Sessions 3`). */
		count?: number;
	};

	export type StageRailProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
		/** The active WorkflowStage; drives `data-current` and `aria-current`. */
		current?: WorkflowStage;
		/** Collapsed = 56px icon-only rail; expanded = 220px (DESIGN.md §3.1). */
		collapsed?: boolean;
		stages?: StageRailItem[];
		/** System group rendered after the divider. */
		system?: StageRailSystemItem[];
		ariaLabel?: string;
		onSelect?: (stage: WorkflowStage) => void;
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		current = $bindable("capture"),
		collapsed = $bindable(false),
		stages = WORKFLOW_STAGES.map((stage) => ({ stage })),
		system = [],
		ariaLabel = "Workflow stages",
		onSelect,
		class: className,
		...restProps
	}: StageRailProps = $props();

	function pick(stage: WorkflowStage) {
		current = stage;
		onSelect?.(stage);
	}
</script>

<nav
	bind:this={ref}
	aria-label={ariaLabel}
	data-slot="stage-rail"
	data-current={current}
	data-collapsed={collapsed ? "true" : "false"}
	class={cn(
		"flex h-full flex-col gap-1 border-r border-border bg-surface-sunken py-3 transition-[width] duration-150",
		collapsed ? "w-14 px-2" : "w-[220px] px-3",
		className,
	)}
	{...restProps}
>
	{#if !collapsed}
		<p
			data-slot="stage-rail-group"
			class="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle"
		>
			Stages
		</p>
	{/if}
	{#each stages as item (item.stage)}
		{@const active = current === item.stage}
		<svelte:element
			this={item.href ? "a" : "button"}
			role={item.href ? undefined : "tab"}
			href={item.href}
			type={item.href ? undefined : "button"}
			aria-current={active ? "page" : undefined}
			aria-selected={item.href ? undefined : active}
			aria-label={STAGE_LABEL[item.stage]}
			title={collapsed ? STAGE_LABEL[item.stage] : undefined}
			data-slot="stage-rail-item"
			data-stage={item.stage}
			data-active={active ? "true" : undefined}
			class={cn(
				"flex h-9 items-center gap-2 rounded-md text-sm font-medium transition-colors",
				collapsed ? "justify-center px-0" : "px-2",
				active
					? "bg-accent text-primary-foreground"
					: "text-fg-subtle hover:bg-surface-elevated hover:text-fg",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
			)}
			onclick={() => pick(item.stage)}
		>
			<span aria-hidden="true" data-slot="stage-rail-glyph" class="text-base leading-none"
				>{STAGE_GLYPH[item.stage]}</span
			>
			{#if !collapsed}
				<span data-slot="stage-rail-label" class="flex-1 text-left">{STAGE_LABEL[item.stage]}</span>
				{#if item.count !== undefined}
					<span
						data-slot="stage-rail-count"
						class={cn("font-mono text-xs", active ? "text-primary-foreground" : "text-fg-muted")}
						>{item.count}</span
					>
				{/if}
			{/if}
		</svelte:element>
	{/each}

	{#if system.length > 0}
		<hr data-slot="stage-rail-divider" class="my-2 border-border" />
		{#if !collapsed}
			<p
				data-slot="stage-rail-group"
				class="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle"
			>
				System
			</p>
		{/if}
		{#each system as item (item.id)}
			<svelte:element
				this={item.href ? "a" : "button"}
				href={item.href}
				type={item.href ? undefined : "button"}
				aria-label={item.label}
				title={collapsed ? item.label : undefined}
				data-slot="stage-rail-system-item"
				data-system-id={item.id}
				class={cn(
					"flex h-9 items-center gap-2 rounded-md text-sm text-fg-subtle transition-colors hover:bg-surface-elevated hover:text-fg",
					collapsed ? "justify-center px-0" : "px-2",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				)}
			>
				<span aria-hidden="true" class="text-base leading-none">{item.glyph ?? "·"}</span>
				{#if !collapsed}
					<span class="flex-1 text-left">{item.label}</span>
				{/if}
			</svelte:element>
		{/each}
	{/if}
</nav>
