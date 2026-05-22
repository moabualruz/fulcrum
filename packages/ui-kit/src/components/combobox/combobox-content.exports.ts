import type { Combobox as ComboboxPrimitive, WithoutChild } from "bits-ui";
import { cn } from "../../utils.js";

export type ComboboxContentProps = WithoutChild<ComboboxPrimitive.ContentProps> & {
	portalProps?: ComboboxPrimitive.PortalProps;
};
