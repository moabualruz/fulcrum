<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import { type VariantProps, tv } from "tailwind-variants";
	import { cn, type WithElementRef } from "../../utils.js";

	export const badgeVariants = tv({
		base: "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium leading-none whitespace-nowrap select-none",
		variants: {
			variant: {
				default: "border-transparent bg-muted text-foreground",
				accent: "border-transparent bg-accent/15 text-accent-foreground",
				success: "border-transparent bg-success/15 text-success",
				warning: "border-transparent bg-warning/20 text-warning-foreground",
				destructive: "border-transparent bg-destructive/15 text-destructive",
				outline: "border-border bg-transparent text-foreground",
			},
			size: {
				sm: "h-5 text-[11px]",
				md: "h-6 text-xs",
				lg: "h-7 text-sm",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "md",
		},
	});

	export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;
	export type BadgeSize = NonNullable<VariantProps<typeof badgeVariants>["size"]>;

	export type BadgeProps = WithElementRef<HTMLAttributes<HTMLSpanElement>> & {
		variant?: BadgeVariant;
		size?: BadgeSize;
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		variant = "default",
		size = "md",
		class: className,
		children,
		...restProps
	}: BadgeProps = $props();
</script>

<span
	bind:this={ref}
	data-slot="badge"
	data-variant={variant}
	data-size={size}
	class={cn(badgeVariants({ variant, size }), className)}
	{...restProps}
>
	{@render children?.()}
</span>
