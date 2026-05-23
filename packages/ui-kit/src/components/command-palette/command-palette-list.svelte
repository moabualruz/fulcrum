<script lang="ts" module>
	import type { Command as CommandPrimitive, WithoutChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type CommandPaletteListProps = WithoutChild<CommandPrimitive.ListProps>;
</script>

<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: CommandPaletteListProps = $props();
</script>

<CommandPrimitive.List
	bind:ref
	data-slot="command-palette-list"
	class={cn("max-h-72 overflow-y-auto p-1", className)}
	{...restProps}
>
	<CommandPrimitive.Viewport>
		{@render children?.()}
	</CommandPrimitive.Viewport>
</CommandPrimitive.List>
