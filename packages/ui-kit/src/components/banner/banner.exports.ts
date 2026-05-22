import type { HTMLAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "../../utils.js";

export type BannerTone = "info" | "warning" | "error" | "success";

const BANNER_TONE_CLASS: Record<BannerTone, string> = {
	info: "border-info bg-info/10",
	warning: "border-warning bg-warning/15",
	error: "border-destructive bg-destructive/10",
	success: "border-success bg-success/10",
};

export type BannerProps = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
	tone?: BannerTone;
	title?: string;
	actions?: import("svelte").Snippet;
	dismissible?: boolean;
	ondismiss?: () => void;
};
