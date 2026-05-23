<script lang="ts" module>
	import type { AlertDialog as AlertDialogPrimitive } from "bits-ui";

	export type AlertDialogProps = AlertDialogPrimitive.RootProps;
</script>

<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from "bits-ui";

	let { open = $bindable(false), children, ...restProps }: AlertDialogProps = $props();
</script>

<AlertDialogPrimitive.Root bind:open {...restProps}>
	{@render children?.()}
</AlertDialogPrimitive.Root>
