<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../../utils.js";

	export type WorkflowMode = "play" | "discuss" | "ai-assist" | "trace";

	const MODE_LABEL: Record<WorkflowMode, string> = {
		play: "Play",
		discuss: "Discuss",
		"ai-assist": "AI Assist",
		trace: "Trace",
	};

	const MODE_GLYPH: Record<WorkflowMode, string> = {
		play: "▶",
		discuss: "💬",
		"ai-assist": "✨",
		trace: "◷",
	};

	const MODE_DESCRIPTION: Record<WorkflowMode, string> = {
		play: "Run the active step",
		discuss: "Open the comment thread",
		"ai-assist": "Continue with an AI Assist session",
		trace: "Inspect run trace and timeline",
	};

	export type ModeRowProps = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		value?: WorkflowMode;
		onSelect?: (mode: WorkflowMode) => void;
		modes?: WorkflowMode[];
		ariaLabel?: string;
	};

	export const WORKFLOW_MODES: WorkflowMode[] = ["play", "discuss", "ai-assist", "trace"];
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		value = $bindable("play"),
		onSelect,
		modes = WORKFLOW_MODES,
		ariaLabel = "Workflow mode",
		class: className,
		...restProps
	}: ModeRowProps = $props();

	function pick(mode: WorkflowMode) {
		value = mode;
		onSelect?.(mode);
	}
</script>

<div
	bind:this={ref}
	role="radiogroup"
	aria-label={ariaLabel}
	data-slot="mode-row"
	data-value={value}
	class={cn(
		"inline-flex items-center gap-1 rounded-full border border-border bg-card p-1",
		className,
	)}
	{...restProps}
>
	{#each modes as mode (mode)}
		{@const active = value === mode}
		<button
			type="button"
			role="radio"
			aria-checked={active}
			aria-label={MODE_DESCRIPTION[mode]}
			data-slot="mode-row-option"
			data-mode={mode}
			data-active={active ? "true" : undefined}
			class={cn(
				"inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
				active
					? "bg-primary text-primary-foreground"
					: "text-muted-foreground hover:bg-muted hover:text-foreground",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
			)}
			onclick={() => pick(mode)}
		>
			<span aria-hidden="true">{MODE_GLYPH[mode]}</span>
			<span>{MODE_LABEL[mode]}</span>
		</button>
	{/each}
</div>
