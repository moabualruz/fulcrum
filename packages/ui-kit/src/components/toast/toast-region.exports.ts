import type { HTMLAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "../../utils.js";
import { defaultToastStore, type ToastStore } from "./toast-store.svelte.js";

export type ToastRegionProps = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
	store?: ToastStore;
	position?: "top-right" | "bottom-right" | "bottom-center";
};
