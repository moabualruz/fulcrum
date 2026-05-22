import type { HTMLAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "../../utils.js";
import type { WorkflowStatus } from "../status-badge/status-badge.exports.js";

export type TaskRowProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
	taskKey: string;
	title: string;
	status: WorkflowStatus;
	assignee?: string;
	priority?: "P0" | "P1" | "P2" | "P3" | "P4";
	estimate?: number;
	selected?: boolean;
	href?: string;
	onSelectToggle?: (next: boolean) => void;
};
