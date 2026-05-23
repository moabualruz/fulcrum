<script lang="ts" module>
	import type { ContextMenu as ContextMenuPrimitive, WithoutChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type ContextMenuItemProps = WithoutChild<ContextMenuPrimitive.ItemProps> & {
		tone?: "neutral" | "destructive";
	};
</script>

<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		tone = "neutral",
		children,
		...restProps
	}: ContextMenuItemProps = $props();
</script>

<ContextMenuPrimitive.Item
	bind:ref
	data-slot="context-menu-item"
	data-tone={tone}
	class={cn(
		"relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none",
		"data-[highlighted]:bg-muted",
		"data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
		tone === "destructive" && "text-destructive data-[highlighted]:bg-destructive/10",
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</ContextMenuPrimitive.Item>
