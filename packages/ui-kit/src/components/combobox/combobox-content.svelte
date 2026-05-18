<script lang="ts" module>
	import type { Combobox as ComboboxPrimitive, WithoutChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type ComboboxContentProps = WithoutChild<ComboboxPrimitive.ContentProps> & {
		portalProps?: ComboboxPrimitive.PortalProps;
	};
</script>

<script lang="ts">
	import { Combobox as ComboboxPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 4,
		portalProps,
		children,
		...restProps
	}: ComboboxContentProps = $props();
</script>

<ComboboxPrimitive.Portal {...portalProps}>
	<ComboboxPrimitive.Content
		bind:ref
		data-slot="combobox-content"
		{sideOffset}
		class={cn(
			"bg-popover text-popover-foreground border-border z-50 max-h-72 min-w-[var(--bits-combobox-anchor-width)] overflow-hidden rounded-md border shadow-md",
			className,
		)}
		{...restProps}
	>
		<ComboboxPrimitive.Viewport class="p-1">
			{@render children?.()}
		</ComboboxPrimitive.Viewport>
	</ComboboxPrimitive.Content>
</ComboboxPrimitive.Portal>
