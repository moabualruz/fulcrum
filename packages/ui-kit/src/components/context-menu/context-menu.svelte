<script lang="ts" module>
	import type { ContextMenu as ContextMenuPrimitive } from "bits-ui";

	export type ContextMenuProps = ContextMenuPrimitive.RootProps;
</script>

<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from "bits-ui";

	let { children, ...restProps }: ContextMenuProps = $props();
</script>

<ContextMenuPrimitive.Root {...restProps}>{@render children?.()}</ContextMenuPrimitive.Root>
