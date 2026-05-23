<script lang="ts" module>
	import { type VariantProps, tv } from "tailwind-variants";

	export const toggleVariants = tv({
		base: "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent text-sm font-medium outline-none transition-[background-color,border-color,color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		variants: {
			variant: {
				default: "bg-transparent hover:bg-muted hover:text-foreground",
				outline: "border-input bg-transparent shadow-xs hover:bg-muted hover:text-foreground",
			},
			size: {
				default: "h-9 px-2.5",
				sm: "h-8 px-2",
				lg: "h-10 px-3",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	});

	export type ToggleVariant = VariantProps<typeof toggleVariants>["variant"];
	export type ToggleSize = VariantProps<typeof toggleVariants>["size"];
</script>

<script lang="ts">
	import { Toggle as TogglePrimitive } from "bits-ui";
	import type { ToggleRootProps } from "bits-ui";
	import { cn, type WithoutChildrenOrChild } from "../../utils.js";

	export type ToggleProps = WithoutChildrenOrChild<ToggleRootProps> & {
		variant?: ToggleVariant;
		size?: ToggleSize;
		class?: string;
	};

	let {
		ref = $bindable(null),
		class: className,
		variant = "default",
		size = "default",
		children,
		...restProps
	}: ToggleProps = $props();
</script>

<TogglePrimitive.Root
	bind:ref
	data-slot="toggle"
	class={cn(toggleVariants({ variant, size }), className)}
	{...restProps}
>
	{@render children?.()}
</TogglePrimitive.Root>
