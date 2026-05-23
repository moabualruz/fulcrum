import type { Select as SelectPrimitive, WithoutChild } from "bits-ui";
import { cn } from "../../utils.js";

export type SelectContentProps = WithoutChild<SelectPrimitive.ContentProps> & {
	portalProps?: SelectPrimitive.PortalProps;
};
