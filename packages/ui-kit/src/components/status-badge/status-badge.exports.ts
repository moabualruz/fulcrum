import type { HTMLAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "../../utils.js";

export type WorkflowStatus =
	| "queued"
	| "running"
	| "waiting-input"
	| "paused"
	| "passing"
	| "failing"
	| "completed"
	| "failed"
	| "blocked"
	| "cancelled"
	| "scheduled";

/**
 * COPY.md §6 canonical 8-state status vocabulary. These eight strings are the
 * cross-surface (web / CLI / TUI) status invariant: DESIGN.md §13 invariant 5.
 * Locked here so no surface can ship a non-canonical synonym and still pass the
 * design gate. Order matches the COPY.md §6 closing line verbatim.
 */
export const CANONICAL_STATUS_VOCAB = [
	"queued",
	"running",
	"waiting-input",
	"passing",
	"failing",
	"completed",
	"cancelled",
	"blocked",
] as const;

export type CanonicalStatus = (typeof CANONICAL_STATUS_VOCAB)[number];

/**
 * COPY.md §6 ban-list. Any of these rendered as a status label is a copy bug.
 * Locked here so the copy-lock fixture and design-e2e can assert their absence.
 */
export const BANNED_STATUS_SYNONYMS = [
	"In Flight",
	"WIP",
	"Doing",
	"Stuck",
	"Done!",
] as const;

const STATUS_LABEL: Record<WorkflowStatus, string> = {
	queued: "Queued",
	running: "Running",
	"waiting-input": "Waiting input",
	paused: "Paused",
	passing: "Passing",
	failing: "Failing",
	completed: "Completed",
	failed: "Failed",
	blocked: "Blocked",
	cancelled: "Cancelled",
	scheduled: "Scheduled",
};

const STATUS_GLYPH: Record<WorkflowStatus, string> = {
	queued: "○",
	running: "●",
	"waiting-input": "◐",
	paused: "❚❚",
	passing: "✓",
	failing: "✕",
	completed: "✓",
	failed: "✕",
	blocked: "■",
	cancelled: "⊘",
	scheduled: "◇",
};

const STATUS_CLASS: Record<WorkflowStatus, string> = {
	queued: "bg-muted text-foreground",
	running: "bg-accent/15 text-accent-foreground",
	"waiting-input": "bg-warning/20 text-warning-foreground",
	paused: "bg-secondary text-secondary-foreground",
	passing: "bg-success/15 text-success",
	failing: "bg-destructive/15 text-destructive",
	completed: "bg-success/15 text-success",
	failed: "bg-destructive/15 text-destructive",
	blocked: "bg-destructive/15 text-destructive",
	cancelled: "bg-muted text-muted-foreground",
	scheduled: "bg-muted text-foreground",
};

/** Canonical COPY.md §6 label for a given status. Single source of truth. */
export function statusLabel(status: WorkflowStatus): string {
	return STATUS_LABEL[status];
}

export type StatusBadgeProps = WithElementRef<HTMLAttributes<HTMLSpanElement>> & {
	status: WorkflowStatus;
	hideLabel?: boolean;
};
