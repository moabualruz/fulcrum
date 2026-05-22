<script lang="ts" module>
	import type { Select as SelectPrimitive, WithoutChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type SelectTriggerProps = WithoutChild<SelectPrimitive.TriggerProps> & {
		size?: "sm" | "md" | "lg";
	};
</script>

<script lang="ts">
	import { Select as SelectPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		size = "md",
		children,
		...restProps
	}: SelectTriggerProps = $props();

	const sizeClass: Record<NonNullable<SelectTriggerProps["size"]>, string> = {
		sm: "h-6 text-xs px-2",
		md: "h-7 text-sm px-2.5",
		lg: "h-8 text-sm px-3",
	};
</script>

<SelectPrimitive.Trigger
	bind:ref
	data-slot="select-trigger"
	data-size={size}
	class={cn(
		"border-input bg-background text-foreground inline-flex w-full items-center justify-between gap-2 rounded-md border shadow-xs outline-none transition-[color,box-shadow]",
		"hover:border-border-strong",
		"focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-2",
		"aria-invalid:border-destructive aria-invalid:ring-destructive/30 aria-invalid:ring-2",
		"disabled:cursor-not-allowed disabled:opacity-50",
		"data-placeholder:text-muted-foreground",
		sizeClass[size],
		className,
	)}
	{...restProps}
>
	{@render children?.()}
	<svg
		aria-hidden="true"
		viewBox="0 0 20 20"
		class="size-4 opacity-60"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path d="M5 8l5 5 5-5" />
	</svg>
</SelectPrimitive.Trigger>
