import type { Popover as PopoverPrimitive, WithoutChild } from "bits-ui";
import { cn } from "../../utils.js";

export type PopoverContentProps = WithoutChild<PopoverPrimitive.ContentProps> & {
	portalProps?: PopoverPrimitive.PortalProps;
};
