// packages/worktrees/src/index.ts
export type {
  Artifact,
  ArtifactContract,
  ArtifactStatus,
  Handoff,
  HandoffMode,
  MarkDirtyInput,
  MarkReadyInput,
  MergeReadinessCheck,
  MergeResult,
  Review,
  ReviewStatus,
  ReviewTargetType,
  Worktree,
  WorktreeStatus,
  AllocateWorktreeInput,
  EnqueueMergeInput,
  DiscardWorktreeInput,
} from './types.js'
export type { ArtifactType } from './types.js'
export { runMigration008 } from './schema.js'
export {
  allocateWorktree,
  cleanupAbandonedWorktrees,
  deallocateWorktree,
  discardWorktree,
  enqueueMerge,
  listMergeQueue,
  markDirty,
  markReadyForMerge,
  processMergeQueue,
} from './worktrees.js'
export type {
  CleanupAbandonedWorktreesInput,
  ProcessMergeQueueInput,
  ProcessMergeQueueResult,
} from './worktrees.js'
export { createWorktreeOps } from './factory.js'
