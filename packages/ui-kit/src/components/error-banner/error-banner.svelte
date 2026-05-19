<script lang="ts" module>
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
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		title,
		message,
		traceId,
		surface = "block",
		retryLabel = "Retry",
		onRetry,
		viewDetailsLabel = "View details",
		onViewDetails,
		detailsOpen = false,
		details,
		class: className,
		...restProps
	}: ErrorBannerProps = $props();

	function copyTraceId(): void {
		if (!traceId) return;
		if (typeof navigator !== "undefined" && navigator.clipboard) {
			void navigator.clipboard.writeText(traceId).catch(() => {});
		}
	}
</script>

<div
	bind:this={ref}
	data-slot="error-banner"
	data-tone="error"
	data-surface={surface}
	role="alert"
	aria-live="polite"
	class={cn(
		"flex flex-col gap-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-foreground",
		className,
	)}
	{...restProps}
>
	<div class={cn("flex flex-wrap items-start gap-2")}>
		<div class={cn("min-w-0 flex-1 space-y-1")}>
			<p data-slot="error-banner-title" class={cn("font-medium text-destructive")}>{title}</p>
			{#if message}
				<p data-slot="error-banner-message" class={cn("text-xs text-muted-foreground")}>{message}</p>
			{/if}
		</div>
		{#if onRetry}
			<button
				type="button"
				data-slot="error-banner-retry"
				class={cn("rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:border-border-strong")}
				onclick={onRetry}
			>{retryLabel}</button>
		{/if}
	</div>

	{#if traceId}
		<p class={cn("flex flex-wrap items-center gap-1 font-mono text-[11px] text-muted-foreground")}>
			<span>trace</span>
			<span data-slot="error-banner-trace">{traceId}</span>
			<button
				type="button"
				data-slot="error-banner-trace-copy"
				aria-label="Copy trace id"
				class={cn("ml-1 rounded-sm border border-border bg-background px-1 text-[10px] hover:border-border-strong")}
				onclick={copyTraceId}
			>copy</button>
		</p>
	{/if}

	{#if onViewDetails || details}
		<details
			data-slot="error-banner-details"
			open={detailsOpen}
			class={cn("rounded-md border border-destructive/30 bg-background/40 text-xs")}
		>
			<summary
				class={cn("cursor-pointer px-2 py-1 font-medium text-destructive")}
				onclick={(event) => {
					if (onViewDetails) {
						event.preventDefault();
						onViewDetails();
					}
				}}
			>{viewDetailsLabel}</summary>
			{#if details}
				<div class={cn("px-2 py-2")}>{@render details()}</div>
			{/if}
		</details>
	{/if}
</div>
