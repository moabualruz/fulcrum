<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../../utils.js";
	import { defaultToastStore, type ToastStore } from "./toast-store.svelte.js";

	export type ToastRegionProps = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		store?: ToastStore;
		position?: "top-right" | "bottom-right" | "bottom-center";
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		store = defaultToastStore,
		position = "bottom-right",
		class: className,
		...restProps
	}: ToastRegionProps = $props();

	const positionClass: Record<NonNullable<ToastRegionProps["position"]>, string> = {
		"top-right": "top-4 right-4 items-end",
		"bottom-right": "bottom-4 right-4 items-end",
		"bottom-center": "bottom-4 left-1/2 -translate-x-1/2 items-center",
	};
</script>

<div
	bind:this={ref}
	data-slot="toast-region"
	data-position={position}
	role="region"
	aria-label="Notifications"
	aria-live="polite"
	class={cn(
		"pointer-events-none fixed z-50 flex flex-col gap-2",
		positionClass[position],
		className,
	)}
	{...restProps}
>
	{#each store.items as item (item.id)}
		<div
			data-slot="toast"
			data-tone={item.tone}
			role={item.tone === "error" || item.tone === "warning" ? "alert" : "status"}
			class={cn(
				"pointer-events-auto flex w-80 max-w-[calc(100vw-2rem)] items-start gap-3 rounded-md border bg-card px-3 py-2 shadow-lg",
				item.tone === "error" && "border-destructive/40",
				item.tone === "warning" && "border-warning/40",
				item.tone === "success" && "border-success/40",
				item.tone === "info" && "border-info/40",
				item.tone === "tip" && "border-accent/40",
			)}
		>
			<div class="grid flex-1 gap-0.5">
				{#if item.title}
					<p class="text-sm font-semibold leading-snug">{item.title}</p>
				{/if}
				{#if item.description}
					<p class="text-sm text-muted-foreground">{item.description}</p>
				{/if}
			</div>
			<button
				type="button"
				aria-label="Dismiss notification"
				data-slot="toast-dismiss"
				class="inline-flex size-6 shrink-0 items-center justify-center rounded-sm hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onclick={() => store.dismiss(item.id)}
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 12 12"
					class="size-3"
					fill="none"
					stroke="currentColor"
					stroke-width="1.75"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M3 3l6 6M9 3l-6 6" />
				</svg>
			</button>
		</div>
	{/each}
</div>
