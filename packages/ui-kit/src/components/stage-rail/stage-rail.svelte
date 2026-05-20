<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../../utils.js";

	/** The six left-to-right WorkflowStages (DESIGN.md §3.1, IA-MAP.md §3). */
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

	/**
	 * An active-stage sub-navigation entry. Per the OD `desktop-shell.html` rail
	 * replica, the StageRail's primary group is the *sub-navigation of the current
	 * stage* (e.g. under `Plan`: Sessions / Reviews / Prototypes / Templates /
	 * Prompts) — NOT the six-stage Capture→Operate axis. That workflow axis is
	 * owned by the ScopeBar stage-tab strip; the rail never renders it.
	 */
	export type StageRailSubnavItem = {
		id: string;
		label: string;
		glyph?: string;
		href?: string;
		/** Optional mono count badge mirroring the OD rail (`Sessions 3`). */
		count?: number;
	};

	/** A System-group entry rendered below the divider (Settings · Knowledge · MCP · Plugins). */
	export type StageRailSystemItem = {
		id: string;
		label: string;
		glyph?: string;
		href?: string;
	};

	/**
	 * A Workspace-group entry — the persistent portfolio destinations (All projects,
	 * Search, Memory, Context) that travel with every WorkflowStage. Rendered above
	 * the System divider so it never competes visually with the active-stage
	 * sub-navigation (DESIGN.md §3.1, IA-MAP.md §3 — the OD `desktop-shell.html`
	 * `Workspace` group).
	 */
	export type StageRailWorkspaceItem = {
		id: string;
		label: string;
		glyph?: string;
		href?: string;
		/** Optional mono count badge mirroring the OD rail (`Inbox 2`). */
		count?: number;
	};

	/**
	 * Legacy six-stage axis item. The StageRail no longer owns the workflow-stage
	 * axis (`prd-web-shell-stage-axis-ownership-fix`): the ScopeBar tab strip does.
	 * `stages` is retained only so the `/design-kit` fixture can exercise the older
	 * stage-list rendering; production shell consumers MUST pass `substages`
	 * instead. When `substages` is non-empty, `stages` is ignored entirely.
	 */
	export type StageRailItem = {
		stage: WorkflowStage;
		href?: string;
		count?: number;
	};

	export type StageRailProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
		/**
		 * The active WorkflowStage. Drives `data-current` so the ScopeBar and the
		 * rail stay in sync, and labels the sub-navigation group; it is *data*, not
		 * a rendered six-stage list.
		 */
		current?: WorkflowStage;
		/** Collapsed = 56px icon-only rail; expanded = 220px (DESIGN.md §3.1). */
		collapsed?: boolean;
		/**
		 * Active-stage sub-navigation — the rail's primary group. The group header
		 * label is the active stage's name (e.g. `Plan`).
		 */
		substages?: StageRailSubnavItem[];
		/**
		 * Legacy six-stage axis. Retained for the `/design-kit` fixture only;
		 * ignored when `substages` is non-empty. Production must not pass this.
		 */
		stages?: StageRailItem[];
		/** Workspace (Portfolio) group rendered between the sub-nav and the System divider. */
		workspace?: StageRailWorkspaceItem[];
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
		substages = [],
		stages = [],
		workspace = [],
		system = [],
		ariaLabel = "Stage navigation",
		onSelect,
		class: className,
		...restProps
	}: StageRailProps = $props();

	// When the production shell supplies active-stage sub-navigation, the rail
	// renders that — never the six-stage workflow axis. `stages` is the legacy
	// design-kit-only fallback, suppressed whenever `substages` is present.
	const showLegacyStages = $derived(substages.length === 0 && stages.length > 0);
	const subnavGroupLabel = $derived(STAGE_LABEL[current]);

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
	{#if substages.length > 0}
		{#if !collapsed}
			<p
				data-slot="stage-rail-substage-group"
				data-stage={current}
				class="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle"
			>
				{subnavGroupLabel}
			</p>
		{/if}
		{#each substages as item (item.id)}
			<svelte:element
				this={item.href ? "a" : "button"}
				href={item.href}
				type={item.href ? undefined : "button"}
				aria-label={item.label}
				title={collapsed ? item.label : undefined}
				data-slot="stage-rail-substage-item"
				data-substage-id={item.id}
				class={cn(
					"flex h-9 items-center gap-2 rounded-md text-sm text-fg-subtle transition-colors hover:bg-surface-elevated hover:text-fg",
					collapsed ? "justify-center px-0" : "px-2",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				)}
			>
				<span aria-hidden="true" class="text-base leading-none">{item.glyph ?? "·"}</span>
				{#if !collapsed}
					<span data-slot="stage-rail-substage-label" class="flex-1 text-left">{item.label}</span>
					{#if item.count !== undefined}
						<span data-slot="stage-rail-substage-count" class="font-mono text-xs text-fg-muted"
							>{item.count}</span
						>
					{/if}
				{/if}
			</svelte:element>
		{/each}
	{/if}

	{#if showLegacyStages}
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
	{/if}

	{#if workspace.length > 0}
		<hr data-slot="stage-rail-divider" class="my-2 border-border" />
		{#if !collapsed}
			<p
				data-slot="stage-rail-workspace-group"
				class="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-fg-muted"
			>
				Workspace
			</p>
		{/if}
		{#each workspace as item (item.id)}
			<svelte:element
				this={item.href ? "a" : "button"}
				href={item.href}
				type={item.href ? undefined : "button"}
				aria-label={item.label}
				title={collapsed ? item.label : undefined}
				data-slot="stage-rail-workspace-item"
				data-workspace-id={item.id}
				class={cn(
					"flex h-9 items-center gap-2 rounded-md text-sm text-fg-subtle transition-colors hover:bg-surface-elevated hover:text-fg",
					collapsed ? "justify-center px-0" : "px-2",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				)}
			>
				<span aria-hidden="true" class="text-base leading-none">{item.glyph ?? "·"}</span>
				{#if !collapsed}
					<span class="flex-1 text-left">{item.label}</span>
					{#if item.count !== undefined}
						<span data-slot="stage-rail-workspace-count" class="font-mono text-xs text-fg-muted"
							>{item.count}</span
						>
					{/if}
				{/if}
			</svelte:element>
		{/each}
	{/if}

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
