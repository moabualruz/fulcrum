<script lang="ts" module>
	import type { Tabs as TabsPrimitive } from "bits-ui";

	export type TabsProps = TabsPrimitive.RootProps;
</script>

<script lang="ts">
	import { Tabs as TabsPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		value = $bindable(),
		children,
		...restProps
	}: TabsProps = $props();
</script>

<TabsPrimitive.Root bind:ref bind:value data-slot="tabs" {...restProps}>
	{@render children?.()}
</TabsPrimitive.Root>
