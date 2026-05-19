/**
 * Shared types for the AcpSession checkpoint engine.
 *
 * Three strategies (git / file / message) all materialise the same
 * `CheckpointRecord` so persistence + event emission share one shape.
 */

export type CheckpointKind = "git" | "file" | "message";

export type CheckpointModeOverride = "auto" | "git" | "file" | "message";

export interface CheckpointTriggerContext {
	/** ID of the session that triggered the checkpoint. */
	sessionId: string;
	/** Working directory the session is anchored to, when known. */
	cwd: string | null;
	/** Zero-based turn index at the time of the checkpoint. */
	turnIndex: number;
	/** UUID of the assistant message that produced the snapshot, when known. */
	messageUuid: string;
	/** Free-form user label; service supplies a default if absent. */
	label?: string | null;
}

export interface CheckpointSnapshotPayload {
	/** Strategy-specific reference (git ref, file path, message-history blob id). */
	ref: string;
	/** Strategy that materialised the snapshot. */
	kind: CheckpointKind;
}

export interface CheckpointRecord extends CheckpointSnapshotPayload {
	id: string;
	sessionId: string;
	turnIndex: number;
	messageUuid: string;
	label: string;
	createdAt: Date;
}

export type CheckpointTriggerReason =
	| "assistant-turn-complete"
	| "explicit-save"
	| "pause";

export interface ResolvedCheckpointMode {
	mode: CheckpointModeOverride;
	source: "session" | "user" | "org" | "default";
}

export interface CheckpointModeInputs {
	sessionOverride?: string | null;
	userPreference?: string | null;
	orgPreference?: string | null;
}

export interface CheckpointRetentionConfig {
	maxCount: number;
	maxAgeDays: number;
}

export const DEFAULT_RETENTION: CheckpointRetentionConfig = {
	maxCount: 20,
	maxAgeDays: 30,
};
