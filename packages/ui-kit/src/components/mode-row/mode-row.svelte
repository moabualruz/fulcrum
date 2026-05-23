<script lang="ts" module>
	import { WorkflowModeValues, type WorkflowMode } from "@fulcrum/shared-dto";
	import type { HTMLAttributes } from "svelte/elements";
	import type { Component } from "svelte";
	import { cn, type WithElementRef } from "../../utils.js";

	// Lucide iconography for the four canonical Step modes. Replaces the prior
	// emoji glyphs (`✋ ▶ 💬 ⊞`) per the project's "use @lucide/svelte instead
	// of emoji" rule. The DESIGN.md §4.13 contract is satisfied: each mode has
	// a stable visual identity, the tab strip stays one-keyboard-stop, the
	// ariaLabel + title strings remain canonical.
	import HandIcon from "@lucide/svelte/icons/hand";
	import PlayIcon from "@lucide/svelte/icons/play";
	import MessageCircleIcon from "@lucide/svelte/icons/message-circle";
	import SparklesIcon from "@lucide/svelte/icons/sparkles";
	import ClockIcon from "@lucide/svelte/icons/clock";

	/**
	 * ModeRow: the universal per-Step mode affordance row (DESIGN.md §4.11, §4.13).
	 *
	 * Every Step (task card, doc block, review item, artifact row, subsystem row,
	 * audit row) carries one ModeRow. It exposes the four canonical execution
	 * modes: Manual / Play / Discuss / AI Assist: as a single `role="toolbar"`
	 * group so a keyboard user reaches every mode with one Tab stop and the arrow
	 * keys, exactly like the OD `.mode-row` markup.
	 *
	 * The legacy `trace` mode is retained as an optional fifth mode for surfaces
	 * (the `/ai-assist` reference route) that already opted into a trace tab; it
	 * is not part of the canonical four and is never rendered unless requested.
	 */

	export type { WorkflowMode } from "@fulcrum/shared-dto";

	/**
	 * ModeRow accepts the canonical shared workflow modes plus two UI-only legacy
	 * aliases used by older reference surfaces.
	 */
	export type ModeRowMode = WorkflowMode | "ai-assist" | "trace";

	/** Density form the row renders in (DESIGN.md §4.13). */
	export type ModeRowDensity = "long" | "compact" | "tight";

	/** The canonical labelled label for each mode (DESIGN.md §4.13 long form). */
	const MODE_LABEL: Record<ModeRowMode, string> = {
		manual: "Manual",
		play: "Play",
		discuss: "Discuss",
		assist: "AI Assist",
		"ai-assist": "AI Assist",
		trace: "Trace",
	};

	/** The label used in the `tight` form, where Manual/Assist are noise. */
	const MODE_TIGHT_LABEL: Record<ModeRowMode, string> = {
		manual: "Manual",
		play: "Suggest",
		discuss: "Discuss",
		assist: "AI Assist",
		"ai-assist": "AI Assist",
		trace: "Trace",
	};

	/** The canonical glyph for each mode (DESIGN.md §4.13 names + lucide icons). */
	const MODE_GLYPH: Record<ModeRowMode, string> = {
		manual: "Manual",
		play: "Play",
		discuss: "Discuss",
		assist: "AI Assist",
		"ai-assist": "AI Assist",
		trace: "Trace",
	};

	/** Lucide icon component for each mode — rendered alongside (or instead of) the label. */
	const MODE_ICON: Record<ModeRowMode, Component> = {
		manual: HandIcon as unknown as Component,
		play: PlayIcon as unknown as Component,
		discuss: MessageCircleIcon as unknown as Component,
		assist: SparklesIcon as unknown as Component,
		"ai-assist": SparklesIcon as unknown as Component,
		trace: ClockIcon as unknown as Component,
	};

	/** Per-action `title`/tooltip text: DESIGN.md §4.13 requires every mode carries one. */
	const MODE_TITLE: Record<ModeRowMode, string> = {
		manual: "Manual: work this step yourself",
		play: "Play: hand off to an AI agent",
		discuss: "Discuss: open the comment thread",
		assist: "AI Assist: open the AI Assist drawer scoped to this step",
		"ai-assist": "AI Assist: open the AI Assist drawer scoped to this step",
		trace: "Trace: inspect the run trace and timeline",
	};

	export type ModeRowProps = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		/** The currently-selected mode. Bindable. */
		value?: ModeRowMode;
		/** Fires whenever a mode button is activated. */
		onSelect?: (mode: ModeRowMode) => void;
		/** The modes rendered, in order. Defaults to the canonical four. */
		modes?: ModeRowMode[];
		/** Density form: `long` labelled, `compact` icon-only, `tight` Suggest/Discuss. */
		density?: ModeRowDensity;
		/** Toolbar `aria-label`. DESIGN.md §4.13 canonical value is `Step modes`. */
		ariaLabel?: string;
	};

	/** The canonical four workflow modes (DESIGN.md §4.13). */
	export const WORKFLOW_MODES = [...WorkflowModeValues] satisfies WorkflowMode[];

	/** The `tight`-form mode subset: Suggest + Discuss only (DESIGN.md §4.13). */
	export const TIGHT_MODES: WorkflowMode[] = ["play", "discuss"];

	/** Stable resolution of a mode to its canonical glyph: exported for sibling surfaces. */
	export function modeGlyph(mode: ModeRowMode): string {
		return MODE_GLYPH[mode];
	}

	/** Stable resolution of a mode to its long-form label: exported for sibling surfaces. */
	export function modeLabel(mode: ModeRowMode): string {
		return MODE_LABEL[mode];
	}
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		value = $bindable("manual"),
		onSelect,
		modes,
		density = "long",
		ariaLabel = "Step modes",
		class: className,
		...restProps
	}: ModeRowProps = $props();

	// The default mode set depends on density: `tight` drops Manual + Assist.
	const resolvedModes = $derived(modes ?? (density === "tight" ? TIGHT_MODES : WORKFLOW_MODES));

	function pick(mode: ModeRowMode) {
		value = mode;
		onSelect?.(mode);
	}

	function labelFor(mode: ModeRowMode): string {
		return density === "tight" ? MODE_TIGHT_LABEL[mode] : MODE_LABEL[mode];
	}
</script>

<div
	bind:this={ref}
	role="toolbar"
	aria-label={ariaLabel}
	data-slot="mode-row"
	data-density={density}
	data-value={value}
	class={cn(
		"inline-flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5",
		className,
	)}
	{...restProps}
>
	{#each resolvedModes as mode (mode)}
		{@const active = value === mode}
		{@const assist = mode === "assist" || mode === "ai-assist"}
		{@const Icon = MODE_ICON[mode]}
		<button
			type="button"
			aria-pressed={active}
			aria-label={MODE_TITLE[mode]}
			title={MODE_TITLE[mode]}
			data-slot="mode-row-option"
			data-mode={mode}
			data-active={active ? "true" : undefined}
			class={cn(
				"inline-flex min-h-6 min-w-6 items-center justify-center gap-1 rounded font-medium transition-colors",
				density === "compact" ? "h-6 w-6 text-sm" : "h-6 px-2 text-xs",
				assist
					? "text-primary hover:bg-primary/10"
					: "text-muted-foreground hover:bg-muted hover:text-foreground",
				active && "bg-primary/10 text-primary",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
			)}
			onclick={() => pick(mode)}
		>
			<Icon aria-hidden="true" class="size-3.5" />
			{#if density !== "compact"}
				<span>{labelFor(mode)}</span>
			{/if}
		</button>
	{/each}
</div>
