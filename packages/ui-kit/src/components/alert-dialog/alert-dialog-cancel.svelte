<script lang="ts" module>
	import type { AlertDialog as AlertDialogPrimitive, WithoutChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type AlertDialogCancelProps = WithoutChild<AlertDialogPrimitive.CancelProps>;
</script>

<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: AlertDialogCancelProps = $props();
</script>

<AlertDialogPrimitive.Cancel
	bind:ref
	data-slot="alert-dialog-cancel"
	class={cn(
		"inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted",
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</AlertDialogPrimitive.Cancel>
