<script lang="ts" module>
	import type { Tabs as TabsPrimitive, WithoutChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type TabsTriggerProps = WithoutChild<TabsPrimitive.TriggerProps>;
</script>

<script lang="ts">
	import { Tabs as TabsPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		value,
		children,
		...restProps
	}: TabsTriggerProps = $props();
</script>

<TabsPrimitive.Trigger
	bind:ref
	{value}
	data-slot="tabs-trigger"
	class={cn(
		"inline-flex h-9 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors",
		"hover:text-foreground",
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
		"data-[state=active]:border-primary data-[state=active]:text-foreground",
		"disabled:cursor-not-allowed disabled:opacity-50",
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</TabsPrimitive.Trigger>
