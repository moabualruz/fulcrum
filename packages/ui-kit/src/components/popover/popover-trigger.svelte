<script lang="ts" module>
	import type { Popover as PopoverPrimitive, WithoutChild } from "bits-ui";

	export type PopoverTriggerProps = WithoutChild<PopoverPrimitive.TriggerProps>;
</script>

<script lang="ts">
	import { Popover as PopoverPrimitive } from "bits-ui";

	let { ref = $bindable(null), children, ...restProps }: PopoverTriggerProps = $props();
</script>

<PopoverPrimitive.Trigger bind:ref data-slot="popover-trigger" {...restProps}>
	{@render children?.()}
</PopoverPrimitive.Trigger>
