<script lang="ts" module>
	import type { Command as CommandPrimitive } from "bits-ui";

	export type CommandPaletteProps = CommandPrimitive.RootProps & {
		open?: boolean;
		title?: string;
	};
</script>

<script lang="ts">
	import { Command as CommandPrimitive, Dialog as DialogPrimitive } from "bits-ui";
	import { cn } from "../../utils.js";

	let {
		open = $bindable(false),
		class: className,
		title = "Command palette",
		children,
		...restProps
	}: CommandPaletteProps = $props();
</script>

<DialogPrimitive.Root bind:open>
	<DialogPrimitive.Portal>
		<DialogPrimitive.Overlay class="fixed inset-0 z-50 bg-surface-overlay backdrop-blur-sm" />
		<!--
			Positioning is set via inline `style` rather than Tailwind arbitrary
			utilities (`top-[12vh]`, `-translate-x-1/2`): a consumer app's Tailwind
			content scan does not always reach this package's source, so arbitrary
			classes can silently no-op. The inline style guarantees the palette
			renders as a top-anchored centred overlay in every consumer.
		-->
		<DialogPrimitive.Content
			style="position:fixed;left:50%;top:12vh;transform:translateX(-50%);z-index:50;width:100%;"
			class={cn(
				"max-w-lg overflow-hidden rounded-md border border-border bg-card shadow-2xl",
				className,
			)}
		>
			<DialogPrimitive.Title class="sr-only">{title}</DialogPrimitive.Title>
			<CommandPrimitive.Root
				data-slot="command-palette"
				class="grid"
				{...restProps}
			>
				{@render children?.()}
			</CommandPrimitive.Root>
		</DialogPrimitive.Content>
	</DialogPrimitive.Portal>
</DialogPrimitive.Root>
