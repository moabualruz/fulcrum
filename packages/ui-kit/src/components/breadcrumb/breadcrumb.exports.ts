import type { HTMLAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "../../utils.js";

export type BreadcrumbItem = {
	label: string;
	href?: string;
	current?: boolean;
};

export type BreadcrumbProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
	items: BreadcrumbItem[];
	separator?: string;
};
