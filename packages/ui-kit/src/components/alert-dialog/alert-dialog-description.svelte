<script lang="ts" module>
	import type { AlertDialog as AlertDialogPrimitive, WithoutChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type AlertDialogDescriptionProps = WithoutChild<AlertDialogPrimitive.DescriptionProps>;
</script>

<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: AlertDialogDescriptionProps = $props();
</script>

<AlertDialogPrimitive.Description
	bind:ref
	data-slot="alert-dialog-description"
	class={cn("text-sm text-muted-foreground", className)}
	{...restProps}
>
	{@render children?.()}
</AlertDialogPrimitive.Description>
