<script lang="ts" module>
	import type { Select as SelectPrimitive, WithoutChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type SelectContentProps = WithoutChild<SelectPrimitive.ContentProps> & {
		portalProps?: SelectPrimitive.PortalProps;
	};
</script>

<script lang="ts">
	import { Select as SelectPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 4,
		portalProps,
		children,
		...restProps
	}: SelectContentProps = $props();
</script>

<SelectPrimitive.Portal {...portalProps}>
	<SelectPrimitive.Content
		bind:ref
		data-slot="select-content"
		{sideOffset}
		class={cn(
			"bg-popover text-popover-foreground border-border z-50 max-h-[var(--bits-select-content-available-height)] min-w-[var(--bits-select-anchor-width)] origin-[var(--bits-select-content-transform-origin)] overflow-hidden rounded-md border shadow-md",
			"data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
			className,
		)}
		{...restProps}
	>
		<SelectPrimitive.ScrollUpButton class="flex h-6 cursor-default items-center justify-center bg-popover text-muted-foreground">
			<svg
				aria-hidden="true"
				viewBox="0 0 20 20"
				class="size-4"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M5 12l5-5 5 5" />
			</svg>
		</SelectPrimitive.ScrollUpButton>
		<SelectPrimitive.Viewport class="p-1">
			{@render children?.()}
		</SelectPrimitive.Viewport>
		<SelectPrimitive.ScrollDownButton class="flex h-6 cursor-default items-center justify-center bg-popover text-muted-foreground">
			<svg
				aria-hidden="true"
				viewBox="0 0 20 20"
				class="size-4"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M5 8l5 5 5-5" />
			</svg>
		</SelectPrimitive.ScrollDownButton>
	</SelectPrimitive.Content>
</SelectPrimitive.Portal>
