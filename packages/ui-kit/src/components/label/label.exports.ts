import type { Label as LabelPrimitive, WithoutChildrenOrChild } from "bits-ui";
import { cn } from "../../utils.js";

export type LabelProps = WithoutChildrenOrChild<LabelPrimitive.RootProps> & {
	/** When true, render an asterisk indicating the field is required. */
	required?: boolean;
	/** When true, mark the label visually as optional (subtler treatment). */
	optional?: boolean;
	children?: import("svelte").Snippet;
};
