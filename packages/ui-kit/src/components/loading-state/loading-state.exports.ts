import type { HTMLAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "../../utils.js";
import Skeleton from "../skeleton/skeleton.svelte";

export type LoadingStateDensity = "compact" | "regular";
export type LoadingStateShape = "panel" | "feed" | "table";

export type LoadingStateProps = WithElementRef<HTMLDivElement> & {
	title?: string;
	description?: string;
	density?: LoadingStateDensity;
	shape?: LoadingStateShape;
	rows?: number;
};
