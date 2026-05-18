<script lang="ts" module>
	import type { ContextMenu as ContextMenuPrimitive, WithoutChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type ContextMenuContentProps = WithoutChild<ContextMenuPrimitive.ContentProps>;
</script>

<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: ContextMenuContentProps = $props();
</script>

<ContextMenuPrimitive.Portal>
	<ContextMenuPrimitive.Content
		bind:ref
		data-slot="context-menu-content"
		class={cn(
			"bg-popover text-popover-foreground border-border z-50 min-w-44 overflow-hidden rounded-md border p-1 shadow-md",
			className,
		)}
		{...restProps}
	>
		{@render children?.()}
	</ContextMenuPrimitive.Content>
</ContextMenuPrimitive.Portal>
