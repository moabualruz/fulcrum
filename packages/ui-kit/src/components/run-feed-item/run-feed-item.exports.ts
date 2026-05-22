import type { HTMLAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "../../utils.js";
import type { WorkflowStatus } from "../status-badge/status-badge.exports.js";

export type RunFeedItemProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
	runId: string;
	taskTitle: string;
	taskKey?: string;
	agentName: string;
	status: WorkflowStatus;
	elapsed?: string;
	lastEvent?: string;
	href?: string;
};
