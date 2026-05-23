import type { HTMLAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "../../utils.js";

/**
 * `absence`: the surface has no data yet (the default zero-data branch).
 * `steady`: the surface is intentionally empty as a healthy steady state
 * (e.g. Operate doctor with every subsystem passing). cross-states.md:
 * "empty is not always absence, it can be a healthy steady state".
 */
export type EmptyStateTone = "absence" | "steady";

export type EmptyStateProps = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
	title: string;
	description?: string;
	/** Keyboard hint shown beside the primary action: DESIGN.md §4.8. */
	keyHint?: string;
	tone?: EmptyStateTone;
	icon?: import("svelte").Snippet;
	actions?: import("svelte").Snippet;
};
