import type { HTMLAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "../../utils.js";

export type TreeNode = {
	id: string;
	label: string;
	hint?: string;
	children?: TreeNode[];
};

export type TreeViewProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
	nodes: TreeNode[];
	expandedIds?: Set<string>;
	selectedId?: string;
	onToggle?: (id: string) => void;
	onSelect?: (id: string) => void;
};
