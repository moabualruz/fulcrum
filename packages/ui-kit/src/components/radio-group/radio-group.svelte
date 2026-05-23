<script lang="ts" module>
	import type { RadioGroup as RadioGroupPrimitive } from "bits-ui";
	import { cn } from "../../utils.js";

	export type RadioGroupProps = RadioGroupPrimitive.RootProps;
</script>

<script lang="ts">
	import { RadioGroup as RadioGroupPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		value = $bindable(),
		children,
		...restProps
	}: RadioGroupProps = $props();
</script>

<RadioGroupPrimitive.Root
	bind:ref
	bind:value
	data-slot="radio-group"
	class={cn("grid gap-2", className)}
	{...restProps}
>
	{@render children?.()}
</RadioGroupPrimitive.Root>
