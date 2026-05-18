<script lang="ts" module>
	import type { AlertDialog as AlertDialogPrimitive, WithoutChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type AlertDialogContentProps = WithoutChild<AlertDialogPrimitive.ContentProps>;
</script>

<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: AlertDialogContentProps = $props();
</script>

<AlertDialogPrimitive.Portal>
	<AlertDialogPrimitive.Overlay
		data-slot="alert-dialog-overlay"
		class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
	/>
	<AlertDialogPrimitive.Content
		bind:ref
		data-slot="alert-dialog-content"
		class={cn(
			"fixed left-1/2 top-1/2 z-50 grid w-full max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-md border border-border bg-card p-6 shadow-lg",
			className,
		)}
		{...restProps}
	>
		{@render children?.()}
	</AlertDialogPrimitive.Content>
</AlertDialogPrimitive.Portal>
