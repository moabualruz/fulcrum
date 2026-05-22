import type { Progress as ProgressPrimitive, WithoutChildrenOrChild } from "bits-ui";
import { cn } from "../../utils.js";

export type ProgressProps = WithoutChildrenOrChild<ProgressPrimitive.RootProps> & {
	label?: string;
};
