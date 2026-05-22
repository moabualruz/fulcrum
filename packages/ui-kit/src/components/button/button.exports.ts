import { cn, type WithElementRef } from "../../utils.js";
import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";
import { tv } from "tailwind-variants";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

const buttonVariantValues = ["primary", "secondary", "ghost", "danger", "link"] as const;
const buttonSizeValues = ["xs", "sm", "md", "lg"] as const;

const buttonClassVariants = tv({
	base: "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-md border border-transparent bg-clip-padding text-sm font-medium focus-visible:ring-3 active:not-aria-[haspopup]:translate-y-px aria-invalid:ring-3 [&_svg:not([class*='size-'])]:size-4 group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 data-[loading=true]:cursor-wait data-[loading=true]:opacity-80 data-[selected=true]:ring-2 data-[selected=true]:ring-ring data-[selected=true]:ring-offset-2 [&_svg]:pointer-events-none [&_svg]:shrink-0",
	variants: {
		variant: {
			primary: "bg-accent text-accent-foreground hover:bg-accent/80 data-[selected=true]:bg-accent/90",
			danger:
				"bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 data-[selected=true]:bg-destructive/95 dark:focus-visible:ring-destructive/40",
			secondary:
				"border-border bg-surface-elevated text-fg shadow-xs hover:bg-surface-sunken aria-expanded:bg-surface-sunken aria-expanded:text-fg data-[selected=true]:bg-surface-sunken",
			ghost:
				"hover:bg-muted hover:text-foreground data-[selected=true]:bg-muted data-[selected=true]:text-foreground dark:hover:bg-muted/50 aria-expanded:bg-muted aria-expanded:text-foreground",
			link: "text-primary underline-offset-4 hover:underline data-[selected=true]:underline",
		},
		size: {
			md: "h-7 gap-1.5 px-2.5 in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
			xs: "h-5 gap-1 rounded-[min(var(--radius-md),8px)] px-1.5 text-xs in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 [&_svg:not([class*='size-'])]:size-3",
			sm: "h-6 gap-1 rounded-[min(var(--radius-md),8px)] px-2 text-xs in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
			lg: "h-8 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
		},
	},
	defaultVariants: {
		variant: "primary",
		size: "md",
	},
});

function normalizeButtonVariant(variant: ButtonVariant | null | undefined): ButtonVariant {
	if (variant === null || variant === undefined) return "primary";
	if (buttonVariantValues.includes(variant)) return variant;
	throw new Error(`Unsupported Button variant: ${variant}`);
}

function normalizeButtonSize(size: ButtonSize | null | undefined): ButtonSize {
	if (size === null || size === undefined) return "md";
	if (buttonSizeValues.includes(size)) return size;
	throw new Error(`Unsupported Button size: ${size}`);
}

export function buttonVariants(options?: {
	variant?: ButtonVariant | null;
	size?: ButtonSize | null;
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
