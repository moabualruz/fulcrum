import type { Select as SelectPrimitive, WithoutChild } from "bits-ui";
import { cn } from "../../utils.js";

export type SelectValueProps = WithoutChild<SelectPrimitive.ValueProps> & {
	placeholder?: string;
};
