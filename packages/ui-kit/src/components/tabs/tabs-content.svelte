<script lang="ts" module>
	import type { Tabs as TabsPrimitive, WithoutChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type TabsContentProps = WithoutChild<TabsPrimitive.ContentProps>;
</script>

<script lang="ts">
	import { Tabs as TabsPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		value,
		children,
		...restProps
	}: TabsContentProps = $props();
</script>

<TabsPrimitive.Content
	bind:ref
	{value}
	data-slot="tabs-content"
	class={cn(
		"pt-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</TabsPrimitive.Content>
