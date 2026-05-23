<script lang="ts" module>
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
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		tone = "info",
		title,
		actions,
		dismissible = false,
		ondismiss,
		class: className,
		children,
		...restProps
	}: BannerProps = $props();
</script>

<div
	bind:this={ref}
	data-slot="banner"
	data-tone={tone}
	role={tone === "error" || tone === "warning" ? "alert" : "status"}
	class={cn(
		"flex items-start gap-3 border-l-4 px-4 py-3",
		BANNER_TONE_CLASS[tone],
		className,
	)}
	{...restProps}
>
	<div class="grid flex-1 gap-1">
		{#if title}
			<p data-slot="banner-title" class="text-sm font-semibold leading-snug">{title}</p>
		{/if}
		<div data-slot="banner-body" class="text-sm text-foreground">
			{@render children?.()}
		</div>
	</div>
	{#if actions}
		<div data-slot="banner-actions" class="flex shrink-0 items-center gap-2">
			{@render actions?.()}
		</div>
	{/if}
	{#if dismissible}
		<button
			type="button"
			aria-label="Dismiss banner"
			data-slot="banner-dismiss"
			class="ml-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			onclick={() => ondismiss?.()}
		>
			<svg
				aria-hidden="true"
				viewBox="0 0 16 16"
				class="size-4"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M4 4l8 8M12 4l-8 8" />
			</svg>
		</button>
	{/if}
</div>
