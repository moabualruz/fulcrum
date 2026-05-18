<script lang="ts" module>
	import type { Combobox as ComboboxPrimitive, WithoutChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type ComboboxItemProps = WithoutChild<ComboboxPrimitive.ItemProps>;
</script>

<script lang="ts">
	import { Combobox as ComboboxPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		value,
		label,
		children,
		...restProps
	}: ComboboxItemProps = $props();
</script>

<ComboboxPrimitive.Item
	bind:ref
	{value}
	{label}
	data-slot="combobox-item"
	class={cn(
		"text-foreground relative flex w-full cursor-default select-none items-center gap-2 rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none",
		"data-[highlighted]:bg-muted",
		"data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
		className,
	)}
	{...restProps}
>
	{#snippet children({ selected })}
		<span class="flex-1 truncate">
			{#if children}{@render children?.()}{:else}{label ?? value}{/if}
		</span>
		{#if selected}
			<svg
				aria-hidden="true"
				viewBox="0 0 16 16"
				class="text-primary absolute right-2 size-4"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M3.5 8.5l3 3 6-6" />
			</svg>
		{/if}
	{/snippet}
</ComboboxPrimitive.Item>
