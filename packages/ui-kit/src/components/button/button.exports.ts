import { cn, type WithElementRef } from "../../utils.js";
import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";
import { tv } from "tailwind-variants";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

type LegacyButtonVariant = "default" | "destructive" | "outline";
type LegacyButtonSize = "default" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
type ButtonVariantInput = ButtonVariant | LegacyButtonVariant;
type ButtonSizeInput = ButtonSize | LegacyButtonSize;

const buttonClassVariants = tv({
	base: "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-md border border-transparent bg-clip-padding text-sm font-medium focus-visible:ring-3 active:not-aria-[haspopup]:translate-y-px aria-invalid:ring-3 [&_svg:not([class*='size-'])]:size-4 group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 data-[loading=true]:cursor-wait data-[loading=true]:opacity-80 data-[selected=true]:ring-2 data-[selected=true]:ring-ring data-[selected=true]:ring-offset-2 [&_svg]:pointer-events-none [&_svg]:shrink-0",
	variants: {
		variant: {
			primary: "bg-accent text-accent-foreground hover:bg-accent/80 data-[selected=true]:bg-accent/90",
			danger:
				"bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 data-[selected=true]:bg-destructive/95 dark:focus-visible:ring-destructive/40",
			secondary:
				"border-border bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground data-[selected=true]:bg-secondary/90",
			ghost:
				"hover:bg-muted hover:text-foreground data-[selected=true]:bg-muted data-[selected=true]:text-foreground dark:hover:bg-muted/50 aria-expanded:bg-muted aria-expanded:text-foreground",
			link: "text-primary underline-offset-4 hover:underline data-[selected=true]:underline",
		},
		size: {
			md: "h-7 gap-1.5 px-2.5 in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
			xs: "h-6 gap-1 rounded-[min(var(--radius-md),8px)] px-2 text-xs in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
			sm: "h-8 gap-1 rounded-[min(var(--radius-md),10px)] px-2.5 in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
			lg: "h-10 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
		},
	},
	defaultVariants: {
		variant: "primary",
		size: "md",
	},
});

function normalizeButtonVariant(variant: ButtonVariantInput | null | undefined): ButtonVariant {
	if (variant === "default") return "primary";
	if (variant === "destructive") return "danger";
	if (variant === "outline") return "secondary";
	return variant ?? "primary";
}

function normalizeButtonSize(size: ButtonSizeInput | null | undefined): ButtonSize {
	if (size === "default") return "md";
	if (size === "icon-xs") return "xs";
	if (size === "icon-sm" || size === "icon") return "sm";
	if (size === "icon-lg") return "lg";
	return size ?? "md";
}

function legacyIconSizeClass(size: ButtonSizeInput | null | undefined): string | undefined {
	if (size === "icon-xs") {
		return "size-6 rounded-[min(var(--radius-md),8px)] px-0 [&_svg:not([class*='size-'])]:size-3";
	}
	if (size === "icon-sm" || size === "icon") return "size-8 px-0";
	if (size === "icon-lg") return "size-10 px-0";
	return undefined;
}

export function buttonVariants(options?: {
	variant?: ButtonVariantInput | null;
	size?: ButtonSizeInput | null;
	class?: string;
	className?: string;
}) {
	const normalizedVariant = normalizeButtonVariant(options?.variant);
	const normalizedSize = normalizeButtonSize(options?.size);

	return cn(
		buttonClassVariants({
			variant: normalizedVariant,
			size: normalizedSize,
		}),
		legacyIconSizeClass(options?.size),
		options?.class,
		options?.className,
	);
}

export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
	WithElementRef<HTMLAnchorAttributes> & {
		variant?: ButtonVariant;
		size?: ButtonSize;
		loading?: boolean;
		selected?: boolean;
	};
