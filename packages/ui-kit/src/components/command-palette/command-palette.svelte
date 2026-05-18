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
		<DialogPrimitive.Overlay class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
		<DialogPrimitive.Content
			class={cn(
				"fixed left-1/2 top-[15%] z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-md border border-border bg-card shadow-2xl",
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
