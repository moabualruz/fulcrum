<script lang="ts" module>
	import type { ContextMenu as ContextMenuPrimitive, WithoutChild } from "bits-ui";

	export type ContextMenuTriggerProps = WithoutChild<ContextMenuPrimitive.TriggerProps>;
</script>

<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from "bits-ui";

	let { ref = $bindable(null), children, ...restProps }: ContextMenuTriggerProps = $props();
</script>

<ContextMenuPrimitive.Trigger bind:ref data-slot="context-menu-trigger" {...restProps}>
	{@render children?.()}
</ContextMenuPrimitive.Trigger>
