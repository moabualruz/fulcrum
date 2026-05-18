<script lang="ts" module>
	import type { Checkbox as CheckboxPrimitive, WithoutChildrenOrChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type CheckboxProps = WithoutChildrenOrChild<CheckboxPrimitive.RootProps>;
</script>

<script lang="ts">
	import { Checkbox as CheckboxPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		checked = $bindable(false),
		indeterminate = $bindable(false),
		...restProps
	}: CheckboxProps = $props();
</script>

<CheckboxPrimitive.Root
	bind:ref
	bind:checked
	bind:indeterminate
	data-slot="checkbox"
	class={cn(
		"peer border-input bg-background size-4 shrink-0 rounded-[var(--radius-xs,2px)] border shadow-xs outline-none transition-[color,box-shadow]",
		"hover:border-border-strong",
		"focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-2",
		"data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground",
		"data-[state=indeterminate]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:text-primary-foreground",
		"disabled:cursor-not-allowed disabled:opacity-50",
		"aria-invalid:border-destructive aria-invalid:ring-destructive/30 aria-invalid:ring-2",
		className,
	)}
	{...restProps}
>
	{#snippet child({ props, checked: isChecked, indeterminate: isIndeterminate })}
		<button {...props}>
			{#if isIndeterminate}
				<svg
					data-slot="checkbox-indicator"
					data-state="indeterminate"
					aria-hidden="true"
					viewBox="0 0 16 16"
					class="size-3"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
				>
					<path d="M4 8h8" />
				</svg>
			{:else if isChecked}
				<svg
					data-slot="checkbox-indicator"
					data-state="checked"
					aria-hidden="true"
					viewBox="0 0 16 16"
					class="size-3"
					fill="none"
					stroke="currentColor"
					stroke-width="2.25"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M3.5 8.5l3 3 6-6" />
				</svg>
			{/if}
		</button>
	{/snippet}
</CheckboxPrimitive.Root>
