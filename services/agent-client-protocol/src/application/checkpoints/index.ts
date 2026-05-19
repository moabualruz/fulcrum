export {
	CheckpointEngine,
	type CheckpointEngineOptions,
	type CheckpointEvent,
	type CheckpointEventSink,
	type CheckpointPersistence,
	type EngineHistoryAccess,
} from "./engine.ts";
export { resolveCheckpointMode } from "./mode-resolution.ts";
export { GitCheckpointStrategy, detectGitWorkingTree } from "./git-strategy.ts";
export { FileCheckpointStrategy } from "./file-strategy.ts";
export { MessageCheckpointStrategy } from "./message-strategy.ts";
export type {
	CheckpointEnvironment,
	CheckpointStrategy,
} from "./strategy.ts";
export {
	type CheckpointKind,
	type CheckpointModeInputs,
	type CheckpointModeOverride,
	type CheckpointRecord,
	type CheckpointRetentionConfig,
	type CheckpointTriggerContext,
	type CheckpointTriggerReason,
	DEFAULT_RETENTION,
	type ResolvedCheckpointMode,
} from "./types.ts";
