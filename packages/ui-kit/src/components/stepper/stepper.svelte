<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../../utils.js";

	export type StepperStep = {
		id: string;
		label: string;
		description?: string;
	};

	export type StepperProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
		steps: StepperStep[];
		currentStep: number;
		orientation?: "horizontal" | "vertical";
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		steps,
		currentStep,
		orientation = "horizontal",
		class: className,
		...restProps
	}: StepperProps = $props();

	function statusOf(index: number): "complete" | "current" | "upcoming" {
		if (index < currentStep) return "complete";
		if (index === currentStep) return "current";
		return "upcoming";
	}
</script>

<nav
	bind:this={ref}
	data-slot="stepper"
	data-orientation={orientation}
	aria-label="Progress"
	class={cn(orientation === "vertical" ? "flex flex-col gap-3" : "flex flex-wrap items-start gap-2", className)}
	{...restProps}
>
	{#each steps as step, index (step.id)}
		{@const status = statusOf(index)}
		<div
			data-slot="stepper-step"
			data-status={status}
			class={cn(
				"flex items-start gap-2",
				orientation === "horizontal" && "flex-1 min-w-32",
			)}
		>
			<span
				data-slot="stepper-indicator"
				aria-current={status === "current" ? "step" : undefined}
				class={cn(
					"flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
					status === "complete" && "border-primary bg-primary text-primary-foreground",
					status === "current" && "border-primary bg-background text-primary",
					status === "upcoming" && "border-border bg-background text-muted-foreground",
				)}
			>
				{#if status === "complete"}
					<svg aria-hidden="true" viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
						<path d="M3.5 8.5l3 3 6-6" />
					</svg>
				{:else}
					{index + 1}
				{/if}
			</span>
			<div class="min-w-0">
				<p class="text-sm font-medium text-foreground">{step.label}</p>
				{#if step.description}
					<p class="text-xs text-muted-foreground">{step.description}</p>
				{/if}
			</div>
		</div>
	{/each}
</nav>
