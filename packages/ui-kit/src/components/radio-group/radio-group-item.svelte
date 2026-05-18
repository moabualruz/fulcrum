<script lang="ts" module>
	import type { RadioGroup as RadioGroupPrimitive, WithoutChildrenOrChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type RadioGroupItemProps = WithoutChildrenOrChild<RadioGroupPrimitive.ItemProps>;
</script>

<script lang="ts">
	import { RadioGroup as RadioGroupPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: RadioGroupItemProps = $props();
</script>

<RadioGroupPrimitive.Item
	bind:ref
	data-slot="radio-group-item"
	class={cn(
		"border-input text-primary aspect-square size-4 shrink-0 rounded-full border bg-background shadow-xs outline-none transition-[color,box-shadow]",
		"hover:border-border-strong",
		"focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-2",
		"data-[state=checked]:border-primary",
		"disabled:cursor-not-allowed disabled:opacity-50",
		"aria-invalid:border-destructive aria-invalid:ring-destructive/30 aria-invalid:ring-2",
		className,
	)}
	{...restProps}
>
	{#snippet child({ props, checked })}
		<button {...props}>
			{#if checked}
				<span
					data-slot="radio-group-indicator"
					data-state="checked"
					aria-hidden="true"
					class="bg-primary mx-auto block size-2 rounded-full"
				></span>
			{/if}
		</button>
	{/snippet}
</RadioGroupPrimitive.Item>
