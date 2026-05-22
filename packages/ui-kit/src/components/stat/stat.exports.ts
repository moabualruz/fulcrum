import type { HTMLAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "../../utils.js";

export type StatTrend = "up" | "down" | "flat";

export type StatProps = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
	label: string;
	value: string;
	delta?: string;
	trend?: StatTrend;
	hint?: string;
};
