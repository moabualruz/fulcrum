<script lang="ts" module>
	import type { Avatar as AvatarPrimitive, WithoutChildrenOrChild } from "bits-ui";
	import { type VariantProps, tv } from "tailwind-variants";
	import { cn } from "../../utils.js";

	export const avatarVariants = tv({
		base: "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted",
		variants: {
			size: {
				xs: "size-6 text-[10px]",
				sm: "size-7 text-xs",
				md: "size-8 text-sm",
				lg: "size-10 text-sm",
				xl: "size-12 text-base",
			},
		},
		defaultVariants: { size: "md" },
	});

	export type AvatarSize = NonNullable<VariantProps<typeof avatarVariants>["size"]>;

	export type AvatarProps = WithoutChildrenOrChild<AvatarPrimitive.RootProps> & {
		size?: AvatarSize;
		children?: import("svelte").Snippet;
	};
</script>

<script lang="ts">
	import { Avatar as AvatarPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		size = "md",
		class: className,
		children,
		...restProps
	}: AvatarProps = $props();
</script>

<AvatarPrimitive.Root
	bind:ref
	data-slot="avatar"
	data-size={size}
	class={cn(avatarVariants({ size }), className)}
	{...restProps}
>
	{@render children?.()}
</AvatarPrimitive.Root>
