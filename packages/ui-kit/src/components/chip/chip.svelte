<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import { type VariantProps, tv } from "tailwind-variants";
	import { cn, type WithElementRef } from "../../utils.js";

	export const chipVariants = tv({
		base: "inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-xs font-medium leading-none select-none",
		variants: {
			tone: {
				neutral: "text-foreground",
				accent: "border-accent/40 text-accent-foreground bg-accent/10",
				success: "border-success/40 text-success bg-success/10",
				warning: "border-warning/40 text-warning-foreground bg-warning/15",
				destructive: "border-destructive/40 text-destructive bg-destructive/10",
			},
			interactive: { yes: "cursor-pointer hover:bg-muted", no: "" },
		},
		defaultVariants: { tone: "neutral", interactive: "no" },
	});

	export type ChipTone = NonNullable<VariantProps<typeof chipVariants>["tone"]>;

	export type ChipProps = WithElementRef<HTMLAttributes<HTMLSpanElement>> & {
		tone?: ChipTone;
		removable?: boolean;
		onremove?: (event: MouseEvent) => void;
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		tone = "neutral",
		removable = false,
		onremove,
		class: className,
		children,
		...restProps
	}: ChipProps = $props();
</script>

<span
	bind:this={ref}
	data-slot="chip"
	data-tone={tone}
	data-removable={removable ? "true" : undefined}
	class={cn(chipVariants({ tone, interactive: removable ? "yes" : "no" }), className)}
	{...restProps}
>
	{@render children?.()}
	{#if removable}
		<button
			type="button"
			aria-label="Remove"
			data-slot="chip-remove"
			class="ml-0.5 inline-flex size-4 items-center justify-center rounded-sm hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			onclick={(event) => onremove?.(event)}
		>
			<svg
				aria-hidden="true"
				viewBox="0 0 12 12"
				class="size-3"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M3 3l6 6M9 3l-6 6" />
			</svg>
		</button>
	{/if}
</span>
