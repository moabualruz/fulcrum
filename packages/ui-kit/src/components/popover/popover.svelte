<script lang="ts" module>
	import type { Popover as PopoverPrimitive } from "bits-ui";

	export type PopoverProps = PopoverPrimitive.RootProps;
</script>

<script lang="ts">
	import { Popover as PopoverPrimitive } from "bits-ui";

	let { open = $bindable(false), children, ...restProps }: PopoverProps = $props();
</script>

<PopoverPrimitive.Root bind:open {...restProps}>
	{@render children?.()}
</PopoverPrimitive.Root>
