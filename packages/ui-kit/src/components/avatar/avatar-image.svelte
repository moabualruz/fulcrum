<script lang="ts" module>
	import type { Avatar as AvatarPrimitive, WithoutChildrenOrChild } from "bits-ui";
	import { cn } from "../../utils.js";

	export type AvatarImageProps = WithoutChildrenOrChild<AvatarPrimitive.ImageProps>;
</script>

<script lang="ts">
	import { Avatar as AvatarPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: AvatarImageProps = $props();
</script>

<AvatarPrimitive.Image
	bind:ref
	data-slot="avatar-image"
	class={cn("aspect-square size-full object-cover", className)}
	{...restProps}
/>
