<script lang="ts" module>
	import type { AlertDialog as AlertDialogPrimitive, WithoutChild } from "bits-ui";

	export type AlertDialogTriggerProps = WithoutChild<AlertDialogPrimitive.TriggerProps>;
</script>

<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from "bits-ui";

	let { ref = $bindable(null), children, ...restProps }: AlertDialogTriggerProps = $props();
</script>

<AlertDialogPrimitive.Trigger bind:ref data-slot="alert-dialog-trigger" {...restProps}>
	{@render children?.()}
</AlertDialogPrimitive.Trigger>
