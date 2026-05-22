import type { HTMLAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "../../utils.js";

export type SortDirection = "asc" | "desc";
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
