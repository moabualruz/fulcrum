<script lang="ts" module>
	import type { Select as SelectPrimitive, WithoutChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type SelectValueProps = WithoutChild<SelectPrimitive.ValueProps> & {
		placeholder?: string;
	};
</script>

<script lang="ts">
	import { Select as SelectPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		placeholder,
		...restProps
	}: SelectValueProps = $props();
</script>

<SelectPrimitive.Value
	bind:ref
	data-slot="select-value"
	class={cn("truncate text-left", className)}
	{placeholder}
	{...restProps}
/>
