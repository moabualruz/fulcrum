<script lang="ts" module>
	import type { Command as CommandPrimitive, WithoutChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type CommandPaletteEmptyProps = WithoutChild<CommandPrimitive.EmptyProps>;
</script>

<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: CommandPaletteEmptyProps = $props();
</script>

<CommandPrimitive.Empty
	bind:ref
	data-slot="command-palette-empty"
	class={cn("px-3 py-4 text-center text-sm text-muted-foreground", className)}
	{...restProps}
>
	{@render children?.()}
</CommandPrimitive.Empty>
