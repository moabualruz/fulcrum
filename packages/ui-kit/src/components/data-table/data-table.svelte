<script lang="ts" module>
	import type { SortDirection } from "@fulcrum/shared-dto";
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../../utils.js";

	export type { SortDirection } from "@fulcrum/shared-dto";
	export type SortState<TField extends string = string> = {
		field: TField | "";
		direction: SortDirection;
	};

	export type DataTableColumn<TRow extends Record<string, unknown>, TField extends string = string> = {
		id: TField;
		label: string;
		sortable?: boolean;
		align?: "left" | "center" | "right";
		width?: string;
		render?: (row: TRow) => string;
	};

	export type DataTableProps<
		TRow extends Record<string, unknown>,
		TField extends string,
	> = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		columns: DataTableColumn<TRow, TField>[];
		rows: TRow[];
		rowKey: (row: TRow) => string;
		sort?: SortState<TField>;
		onSort?: (sort: SortState<TField>) => void;
		stickyHeader?: boolean;
		density?: "comfortable" | "cozy" | "compact";
	};
</script>

<script lang="ts" generics="TRow extends Record<string, unknown>, TField extends string = string">
	let {
		ref = $bindable(null),
		columns,
		rows,
		rowKey,
		sort,
		onSort,
		stickyHeader = true,
		density = "cozy",
		class: className,
		...restProps
	}: DataTableProps<TRow, TField> = $props();

	const rowHeightClass: Record<"comfortable" | "cozy" | "compact", string> = {
		comfortable: "h-12",
		cozy: "h-9",
		compact: "h-7",
	};

	function ariaSortValue(field: TField): "ascending" | "descending" | "none" {
		if (!sort || sort.field !== field) return "none";
		return sort.direction === "asc" ? "ascending" : "descending";
	}

	function nextDirection(field: TField): SortDirection {
		if (sort?.field === field && sort.direction === "asc") return "desc";
		return "asc";
	}
</script>

<div
	bind:this={ref}
	data-slot="data-table"
	data-density={density}
	class={cn("overflow-hidden rounded-md border border-border bg-card", className)}
	{...restProps}
>
	<div class="max-h-[480px] overflow-auto">
		<table class="w-full border-collapse text-sm">
			<thead class={cn("bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground", stickyHeader && "sticky top-0 z-10")}>
				<tr>
					{#each columns as column (column.id)}
						<th
							data-slot="data-table-header"
							data-field={column.id}
							aria-sort={ariaSortValue(column.id)}
							class={cn(
								"px-3 py-2 text-left font-medium",
								column.align === "center" && "text-center",
								column.align === "right" && "text-right",
							)}
							style:width={column.width}
						>
							{#if column.sortable}
								<button
									type="button"
									data-slot="data-table-sort-trigger"
									data-field={column.id}
									data-active={sort?.field === column.id ? "true" : undefined}
									class="inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
									onclick={() => onSort?.({ field: column.id, direction: nextDirection(column.id) })}
								>
									{column.label}
									{#if sort?.field === column.id}
										<span aria-hidden="true" class="text-[10px]">
											{sort.direction === "asc" ? "▲" : "▼"}
										</span>
									{/if}
								</button>
							{:else}
								<span>{column.label}</span>
							{/if}
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each rows as row (rowKey(row))}
					<tr
						data-slot="data-table-row"
						class={cn("border-t border-border", rowHeightClass[density], "hover:bg-muted/30")}
					>
						{#each columns as column (column.id)}
							<td
								data-slot="data-table-cell"
								data-field={column.id}
								class={cn(
									"px-3 align-middle",
									column.align === "center" && "text-center",
									column.align === "right" && "text-right",
								)}
							>
								{column.render ? column.render(row) : String(row[column.id] ?? "")}
							</td>
						{/each}
					</tr>
				{/each}
				{#if rows.length === 0}
					<tr>
						<td colspan={columns.length} class="px-3 py-6 text-center text-muted-foreground">
							No rows to display.
						</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>
</div>
