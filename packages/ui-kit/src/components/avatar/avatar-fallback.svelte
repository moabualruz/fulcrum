<script lang="ts" module>
	import type { Avatar as AvatarPrimitive, WithoutChildrenOrChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type AvatarFallbackProps = WithoutChildrenOrChild<AvatarPrimitive.FallbackProps> & {
		children?: import("svelte").Snippet;
	};
</script>

<script lang="ts">
	import { Avatar as AvatarPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: AvatarFallbackProps = $props();
</script>

<AvatarPrimitive.Fallback
	bind:ref
	data-slot="avatar-fallback"
	class={cn(
		"flex size-full items-center justify-center rounded-full bg-muted font-medium text-foreground",
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</AvatarPrimitive.Fallback>
