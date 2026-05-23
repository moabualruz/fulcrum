<script lang="ts" module>
	import type { AlertDialog as AlertDialogPrimitive, WithoutChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type AlertDialogTitleProps = WithoutChild<AlertDialogPrimitive.TitleProps>;
</script>

<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: AlertDialogTitleProps = $props();
</script>

<AlertDialogPrimitive.Title
	bind:ref
	data-slot="alert-dialog-title"
	class={cn("text-base font-semibold", className)}
	{...restProps}
>
	{@render children?.()}
</AlertDialogPrimitive.Title>
