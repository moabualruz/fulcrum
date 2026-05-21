<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../../utils.js";
	import type { WorkflowStage } from "./stage-rail.svelte";

	export type MobileStageTabItem = {
		stage: WorkflowStage;
		label: string;
		href: string;
	};

	export type MobileStageTabsProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
		items: readonly MobileStageTabItem[];
		current?: WorkflowStage;
		aiAssistOpen?: boolean;
		onNavigate?: (stage: WorkflowStage, href: string) => void;
		onAiAssist?: () => void;
	};

	const STAGE_GLYPH: Record<WorkflowStage, string> = {
		capture: "C",
		plan: "P",
		build: "B",
		review: "R",
		ship: "S",
		operate: "O",
	};

	const STAGE_LABEL: Record<WorkflowStage, string> = {
		capture: "Capture",
		plan: "Plan",
		build: "Build",
		review: "Review",
		ship: "Ship",
		operate: "Operate",
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		items,
		current = "capture",
		aiAssistOpen = false,
		onNavigate,
		onAiAssist,
		class: className,
		...restProps
	}: MobileStageTabsProps = $props();
</script>

<nav
	bind:this={ref}
	aria-label="Mobile stage navigation"
	data-slot="mobile-stage-tabs"
	data-bottom-stage-tabs
	data-active-stage={current}
	class={cn(
		"fixed inset-x-0 bottom-0 z-40 max-w-[100vw] overflow-hidden border-t border-border bg-surface-elevated shadow-lg backdrop-blur",
		"pb-[var(--fulcrum-gesture-zone-bottom)]",
		className,
	)}
	{...restProps}
>
	<div class="grid h-16 grid-cols-7 items-stretch px-1">
		{#each items as item (item.stage)}
			{@const active = item.stage === current}
			{@const label = item.label ?? STAGE_LABEL[item.stage]}
			<button
				type="button"
				data-slot="mobile-stage-tab"
				data-stage={item.stage}
				data-active={active ? "true" : "false"}
				aria-current={active ? "page" : undefined}
				aria-label={label}
				onclick={() => onNavigate?.(item.stage, item.href)}
				class={cn(
					"relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-sm px-1 text-[10px] font-medium text-fg-subtle",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					active && "text-accent",
				)}
			>
				<span
					aria-hidden="true"
					data-slot="mobile-stage-tab-icon"
					class={cn(
						"grid size-6 place-items-center rounded-full border border-border bg-surface text-[11px]",
						active && "border-accent bg-accent text-primary-foreground",
					)}
				>
					{STAGE_GLYPH[item.stage]}
				</span>
				<span data-slot="mobile-stage-tab-label" class="truncate">{label}</span>
			</button>
		{/each}
		<button
			type="button"
			data-slot="mobile-stage-tab-ai-assist"
			data-ai-assist-open={aiAssistOpen ? "true" : "false"}
			aria-label="AI Assist"
			aria-pressed={aiAssistOpen}
			onclick={onAiAssist}
			class={cn(
				"relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-sm px-1 text-[10px] font-medium text-accent",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
			)}
		>
			<span
				aria-hidden="true"
				data-slot="mobile-stage-tab-ai-assist-icon"
				class={cn(
					"grid size-6 place-items-center rounded-full border border-accent bg-accent text-[11px] text-primary-foreground",
				)}
			>
				AI
			</span>
			<span data-slot="mobile-stage-tab-label" class="truncate">AI Assist</span>
		</button>
	</div>
</nav>
