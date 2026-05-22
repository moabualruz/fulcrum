import type { HTMLAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "../../utils.js";

export type FormFieldProps = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
	label?: string;
	description?: string;
	error?: string;
	required?: boolean;
	optional?: boolean;
	htmlFor?: string;
	layout?: "stacked" | "inline";
};
