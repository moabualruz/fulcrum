import type { HTMLAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "../../utils.js";

export type SkeletonShape = "text" | "rect" | "circle";

export type SkeletonProps = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
	shape?: SkeletonShape;
	width?: string;
	height?: string;
	lines?: number;
};
