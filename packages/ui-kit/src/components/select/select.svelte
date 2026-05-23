<script lang="ts" module>
	import type { Select as SelectPrimitive } from "bits-ui";

	export type SelectProps = SelectPrimitive.RootProps;
</script>

<script lang="ts">
	import { Select as SelectPrimitive } from "bits-ui";

	let {
		value = $bindable(),
		open = $bindable(false),
		children,
		...restProps
	}: SelectProps = $props();
</script>

<SelectPrimitive.Root bind:value bind:open data-slot="select" {...restProps}>
	{@render children?.()}
</SelectPrimitive.Root>
