<script lang="ts" module>
	import type { Combobox as ComboboxPrimitive, WithoutChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type ComboboxInputProps = WithoutChild<ComboboxPrimitive.InputProps>;
</script>

<script lang="ts">
	import { Combobox as ComboboxPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: ComboboxInputProps = $props();
</script>

<ComboboxPrimitive.Input
	bind:ref
	data-slot="combobox-input"
	class={cn(
		"h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none",
		"placeholder:text-muted-foreground",
		"focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-2",
		"disabled:cursor-not-allowed disabled:opacity-50",
		className,
	)}
	{...restProps}
/>
