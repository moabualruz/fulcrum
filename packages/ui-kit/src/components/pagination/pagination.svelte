<script lang="ts" module>
	import type { Pagination as PaginationPrimitive } from "bits-ui";
	import { cn } from "../../utils.js";

	export type PaginationProps = PaginationPrimitive.RootProps;
</script>

<script lang="ts">
	import { Pagination as PaginationPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		page = $bindable(1),
		count,
		perPage = 10,
		siblingCount = 1,
		class: className,
		...restProps
	}: PaginationProps = $props();
</script>

<PaginationPrimitive.Root
	bind:ref
	bind:page
	{count}
	{perPage}
	{siblingCount}
	data-slot="pagination"
	{...restProps}
>
	{#snippet children({ pages, currentPage })}
		<nav class={cn("flex items-center gap-1", className)} aria-label="Pagination">
			<PaginationPrimitive.PrevButton
				data-slot="pagination-prev"
				class="inline-flex size-9 items-center justify-center rounded-md border border-border bg-background text-sm hover:bg-muted disabled:opacity-50"
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 16 16"
					class="size-4"
					fill="none"
					stroke="currentColor"
					stroke-width="1.75"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M10 4l-4 4 4 4" />
				</svg>
				<span class="sr-only">Previous page</span>
			</PaginationPrimitive.PrevButton>
			{#each pages as item (item.key)}
				{#if item.type === "ellipsis"}
					<span data-slot="pagination-ellipsis" class="px-2 text-sm text-muted-foreground">…</span>
				{:else}
					<PaginationPrimitive.Page
						page={item}
						data-slot="pagination-page"
						data-active={item.value === currentPage ? "true" : undefined}
						class={cn(
							"inline-flex size-9 items-center justify-center rounded-md border border-transparent text-sm hover:border-border",
							item.value === currentPage && "border-border bg-muted font-semibold",
						)}
					>
						{item.value}
					</PaginationPrimitive.Page>
				{/if}
			{/each}
			<PaginationPrimitive.NextButton
				data-slot="pagination-next"
				class="inline-flex size-9 items-center justify-center rounded-md border border-border bg-background text-sm hover:bg-muted disabled:opacity-50"
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 16 16"
					class="size-4"
					fill="none"
					stroke="currentColor"
					stroke-width="1.75"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M6 4l4 4-4 4" />
				</svg>
				<span class="sr-only">Next page</span>
			</PaginationPrimitive.NextButton>
		</nav>
	{/snippet}
</PaginationPrimitive.Root>
