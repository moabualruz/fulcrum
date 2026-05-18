<script lang="ts" module>
	import type { Progress as ProgressPrimitive, WithoutChildrenOrChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type ProgressProps = WithoutChildrenOrChild<ProgressPrimitive.RootProps> & {
		label?: string;
	};
</script>

<script lang="ts">
	import { Progress as ProgressPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		value = $bindable(0),
		max = 100,
		class: className,
		label,
		...restProps
	}: ProgressProps = $props();

	const percent = $derived(
		typeof value === "number" ? Math.min(100, Math.max(0, (value / max) * 100)) : 0,
	);
</script>

<ProgressPrimitive.Root
	bind:ref
	bind:value
	{max}
	aria-label={label}
	data-slot="progress"
	class={cn(
		"relative h-2 w-full overflow-hidden rounded-full bg-muted",
		className,
	)}
	{...restProps}
>
	<span
		data-slot="progress-indicator"
		class="block h-full bg-primary transition-[width] duration-200"
		style:width="{percent}%"
	></span>
</ProgressPrimitive.Root>
