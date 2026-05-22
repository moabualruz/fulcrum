import type { Select as SelectPrimitive, WithoutChild } from "bits-ui";
import { cn } from "../../utils.js";

export type SelectTriggerProps = WithoutChild<SelectPrimitive.TriggerProps> & {
	size?: "sm" | "md" | "lg";
};
