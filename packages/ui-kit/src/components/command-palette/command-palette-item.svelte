<script lang="ts" module>
	import type { Command as CommandPrimitive, WithoutChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type CommandPaletteItemProps = WithoutChild<CommandPrimitive.ItemProps>;
</script>

<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		value,
		children,
		...restProps
	}: CommandPaletteItemProps = $props();
</script>

<CommandPrimitive.Item
	bind:ref
	{value}
	data-slot="command-palette-item"
	class={cn(
		"flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none",
		"data-[selected]:bg-muted",
		"data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</CommandPrimitive.Item>
