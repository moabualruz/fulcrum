import type { ScrollArea as ScrollAreaPrimitive } from "bits-ui";
import { cn, type WithoutChild } from "../../utils.js";

export type ScrollAreaOrientation = "vertical" | "horizontal" | "both";

export type ScrollAreaProps = WithoutChild<ScrollAreaPrimitive.RootProps> & {
	/** Which scrollbars to render. Defaults to `vertical`. */
	orientation?: ScrollAreaOrientation;
	/** Element ref of the scrollable viewport. */
	viewportRef?: HTMLElement | null;
	/** Extra classes for the horizontal scrollbar. */
	scrollbarXClasses?: string;
	/** Extra classes for the vertical scrollbar. */
	scrollbarYClasses?: string;
	/** Extra classes for the viewport. */
	viewportClasses?: string;
	/** Accessible name for the keyboard-focusable viewport. */
	viewportLabel?: string;
	/** Landmark role for the keyboard-focusable viewport. */
	viewportRole?: "region" | "group";
};
