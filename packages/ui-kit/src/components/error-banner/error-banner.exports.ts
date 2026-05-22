import type { HTMLAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "../../utils.js";

export type ErrorBannerSurface = "row" | "form" | "drawer" | "block";

export type ErrorBannerProps = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
	title: string;
	message?: string;
	traceId?: string;
	surface?: ErrorBannerSurface;
	retryLabel?: string;
	onRetry?: () => void;
	viewDetailsLabel?: string;
	onViewDetails?: () => void;
	detailsOpen?: boolean;
	details?: import("svelte").Snippet;
};
