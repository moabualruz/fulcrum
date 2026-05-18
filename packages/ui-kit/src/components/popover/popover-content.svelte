<script lang="ts" module>
	import type { Popover as PopoverPrimitive, WithoutChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type PopoverContentProps = WithoutChild<PopoverPrimitive.ContentProps> & {
		portalProps?: PopoverPrimitive.PortalProps;
	};
</script>

<script lang="ts">
	import { Popover as PopoverPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 8,
		align = "start",
		portalProps,
		children,
		...restProps
	}: PopoverContentProps = $props();
</script>

<PopoverPrimitive.Portal {...portalProps}>
	<PopoverPrimitive.Content
		bind:ref
		data-slot="popover-content"
		{sideOffset}
		{align}
		class={cn(
			"bg-popover text-popover-foreground border-border z-50 w-72 origin-[var(--bits-popover-content-transform-origin)] rounded-md border p-3 shadow-md outline-none",
			className,
		)}
		{...restProps}
	>
		{@render children?.()}
	</PopoverPrimitive.Content>
</PopoverPrimitive.Portal>
