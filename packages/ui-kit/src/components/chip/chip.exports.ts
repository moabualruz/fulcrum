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
