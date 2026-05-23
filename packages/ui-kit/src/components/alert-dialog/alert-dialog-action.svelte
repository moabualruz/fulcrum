<script lang="ts" module>
	import type { AlertDialog as AlertDialogPrimitive, WithoutChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type AlertDialogActionProps = WithoutChild<AlertDialogPrimitive.ActionProps> & {
		tone?: "primary" | "destructive";
	};
</script>

<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		tone = "primary",
		children,
		...restProps
	}: AlertDialogActionProps = $props();
</script>

<AlertDialogPrimitive.Action
	bind:ref
	data-slot="alert-dialog-action"
	data-tone={tone}
	class={cn(
		"inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium",
		tone === "destructive"
			? "bg-destructive text-fg-inverse hover:bg-destructive/90"
			: "bg-primary text-primary-foreground hover:bg-primary/90",
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</AlertDialogPrimitive.Action>
