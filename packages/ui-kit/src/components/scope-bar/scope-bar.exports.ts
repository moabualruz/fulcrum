import type { HTMLAttributes } from "svelte/elements";
import type { Snippet } from "svelte";
import { cn, type WithElementRef } from "../../utils.js";
import { WORKFLOW_STAGES, type WorkflowStage } from "../stage-rail/stage-rail.exports.js";

export type { WorkflowStage } from "../stage-rail/stage-rail.exports.js";

const STAGE_LABEL: Record<WorkflowStage, string> = {
	capture: "Capture",
	plan: "Plan",
	build: "Build",
	review: "Review",
	ship: "Ship",
	operate: "Operate",
};

export type ScopeBarProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
	/** Brand mark label rendered left of the workspace path. */
	brand?: string;
	/** Desktop renders full stage tabs; mobile renders compact workspace + active-stage chips. */
	variant?: "desktop" | "mobile";
	/** Monospace workspace path (`mkh / fulcrum · auth-rewrite`). */
	workspacePath?: string;
	/** Active WorkflowStage; drives the stage navigation + `data-active-stage`. */
	activeStage?: WorkflowStage;
	stages?: WorkflowStage[];
	onSelectStage?: (stage: WorkflowStage) => void;
	/** TraceBadge slot: the consumer passes a `<TraceChip badge />`. */
	trace?: Snippet;
	/** System icon cluster slot (palette, notifications, display, help, avatar). */
	systemCluster?: Snippet;
};
