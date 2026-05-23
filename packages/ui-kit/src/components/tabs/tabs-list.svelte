<script lang="ts" module>
	import type { Tabs as TabsPrimitive, WithoutChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type TabsListProps = WithoutChild<TabsPrimitive.ListProps>;
</script>

<script lang="ts">
	import { Tabs as TabsPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: TabsListProps = $props();
</script>

<TabsPrimitive.List
	bind:ref
	data-slot="tabs-list"
	class={cn("inline-flex items-center gap-1 border-b border-border", className)}
	{...restProps}
>
	{@render children?.()}
</TabsPrimitive.List>
