<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../../utils.js";

	export type SkeletonShape = "text" | "rect" | "circle";

	export type SkeletonProps = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		shape?: SkeletonShape;
		width?: string;
		height?: string;
		lines?: number;
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		shape = "rect",
		width,
		height,
		lines = 1,
		class: className,
		...restProps
	}: SkeletonProps = $props();

	const shapeClass: Record<SkeletonShape, string> = {
		text: "h-3 rounded",
		rect: "rounded-md",
		circle: "rounded-full aspect-square",
	};
</script>

{#if shape === "text" && lines > 1}
	<div
		bind:this={ref}
		data-slot="skeleton"
		data-shape="text"
		role="status"
		aria-label="Loading"
		class={cn("flex flex-col gap-2", className)}
		{...restProps}
	>
		{#each Array.from({ length: lines }) as _, index (index)}
			<span
				data-slot="skeleton-line"
				class={cn("block animate-pulse bg-muted", shapeClass.text)}
				style:width={index === lines - 1 ? "60%" : "100%"}
				style:height={height}
			></span>
		{/each}
	</div>
{:else}
	<div
		bind:this={ref}
		data-slot="skeleton"
		data-shape={shape}
		role="status"
		aria-label="Loading"
		class={cn("animate-pulse bg-muted", shapeClass[shape], className)}
		style:width
		style:height
		{...restProps}
	></div>
{/if}
