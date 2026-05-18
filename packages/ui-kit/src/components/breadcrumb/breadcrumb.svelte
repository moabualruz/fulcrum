<script lang="ts" module>
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
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		items,
		separator = "/",
		class: className,
		...restProps
	}: BreadcrumbProps = $props();
</script>

<nav
	bind:this={ref}
	data-slot="breadcrumb"
	aria-label="Breadcrumb"
	class={cn("flex", className)}
	{...restProps}
>
	<ol class="flex flex-wrap items-center gap-1.5 text-sm">
		{#each items as item, index (item.label + index)}
			<li
				data-slot="breadcrumb-item"
				data-current={item.current ? "true" : undefined}
				class="inline-flex items-center gap-1.5"
			>
				{#if item.current || !item.href}
					<span
						aria-current={item.current ? "page" : undefined}
						class={cn(item.current ? "font-medium text-foreground" : "text-muted-foreground")}
					>
						{item.label}
					</span>
				{:else}
					<a
						href={item.href}
						class="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:underline"
					>
						{item.label}
					</a>
				{/if}
				{#if index < items.length - 1}
					<span aria-hidden="true" data-slot="breadcrumb-separator" class="text-muted-foreground">
						{separator}
					</span>
				{/if}
			</li>
		{/each}
	</ol>
</nav>
