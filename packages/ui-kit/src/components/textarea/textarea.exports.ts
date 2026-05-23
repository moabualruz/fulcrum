import type { HTMLTextareaAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "../../utils.js";

export type TextareaProps = WithElementRef<HTMLTextareaAttributes> & {
	autoResize?: boolean;
	minRows?: number;
	maxRows?: number;
};
