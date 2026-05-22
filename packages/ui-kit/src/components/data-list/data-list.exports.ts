import type { HTMLAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "../../utils.js";

export type DataListItem = {
	label: string;
	value: string;
	hint?: string;
};

export type DataListProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
	items: DataListItem[];
	variant?: "stacked" | "inline";
};
