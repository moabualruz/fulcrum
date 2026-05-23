<script lang="ts" module>
	import type { ScrollArea as ScrollAreaPrimitive } from "bits-ui";
	import { cn, type WithoutChild } from "../../utils.js";

	export type ScrollAreaOrientation = "vertical" | "horizontal" | "both";

	export type ScrollAreaProps = WithoutChild<ScrollAreaPrimitive.RootProps> & {
		/** Which scrollbars to render. Defaults to `vertical`. */
		orientation?: ScrollAreaOrientation;
		/** Element ref of the scrollable viewport. */
		viewportRef?: HTMLElement | null;
		/** Extra classes for the horizontal scrollbar. */
		scrollbarXClasses?: string;
		/** Extra classes for the vertical scrollbar. */
		scrollbarYClasses?: string;
		/** Extra classes for the viewport. */
		viewportClasses?: string;
		/** Accessible name for the keyboard-focusable viewport. */
		viewportLabel?: string;
		/** Landmark role for the keyboard-focusable viewport. */
		viewportRole?: "region" | "group";
	};
</script>

<script lang="ts">
	import { ScrollArea as ScrollAreaPrimitive } from "bits-ui";
	import Scrollbar from "./scroll-area-scrollbar.svelte";

	let {
		ref = $bindable(null),
		viewportRef = $bindable(null),
		class: className,
		orientation = "vertical",
		scrollbarXClasses,
		scrollbarYClasses,
		viewportClasses,
		viewportLabel = "Scrollable content",
		viewportRole = "region",
		children,
		...restProps
	}: ScrollAreaProps = $props();
</script>

<ScrollAreaPrimitive.Root
	bind:ref
	data-slot="scroll-area"
	data-orientation={orientation}
	class={cn("relative", className)}
	{...restProps}
>
	<ScrollAreaPrimitive.Viewport
		bind:ref={viewportRef}
		data-slot="scroll-area-viewport"
		tabindex="0"
		role={viewportRole}
		aria-label={viewportLabel}
		class={cn(
			"size-full rounded-[inherit] outline-none transition-[color,box-shadow] focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-1",
			viewportClasses,
		)}
	>
		{@render children?.()}
	</ScrollAreaPrimitive.Viewport>
	{#if orientation === "vertical" || orientation === "both"}
		<Scrollbar orientation="vertical" class={scrollbarYClasses} />
	{/if}
	{#if orientation === "horizontal" || orientation === "both"}
		<Scrollbar orientation="horizontal" class={scrollbarXClasses} />
	{/if}
	<ScrollAreaPrimitive.Corner />
</ScrollAreaPrimitive.Root>
