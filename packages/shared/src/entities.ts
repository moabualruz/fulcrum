import { z } from "zod";
import { FulcrumIdSchema, SchemaVersionSchema, TimestampSchema } from "./ids.js";
import {
  CapabilityStateSchema,
  MemoryStatusSchema,
  RunStatusSchema,
  SetupStatusSchema,
  SyncStatusSchema,
  TaskStatusSchema,
  WorktreeStatusSchema
} from "./lifecycle.js";
import { PrivacyModeSchema, RedactionStatusSchema, SourceRefSchema } from "./contracts/common.js";

const BaseEntitySchema = z.object({
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  schemaVersion: SchemaVersionSchema
});

export const SetupStateSchema = BaseEntitySchema.extend({
  setupId: FulcrumIdSchema,
  status: SetupStatusSchema,
  stateRoot: z.string(),
  configPath: z.string(),
  dbPath: z.string(),
  artifactRoot: z.string(),
  logRoot: z.string(),
  backupRoot: z.string(),
  managedMemoryRoot: z.string(),
  privacyMode: PrivacyModeSchema,
  networkDefault: z.enum(["local-only", "operator-configured"]),
  redactionProfileId: FulcrumIdSchema
});

export const ProjectSchema = BaseEntitySchema.extend({
  projectId: FulcrumIdSchema,
  name: z.string(),
  rootPath: z.string(),
  defaultBranch: z.string(),
  worktreePolicyId: FulcrumIdSchema,
  ignoredPathPolicyId: FulcrumIdSchema,
  qualityGateSetId: FulcrumIdSchema,
  privacyMode: PrivacyModeSchema,
  healthState: CapabilityStateSchema,
  enabledCapabilities: z.array(FulcrumIdSchema).default([]),
  disabledCapabilities: z.array(FulcrumIdSchema).default([]),
  adapterMappings: z.record(z.string()).default({}),
  lastScannedAt: TimestampSchema.optional()
});

export const TaskSchema = BaseEntitySchema.extend({
  taskId: FulcrumIdSchema,
  projectId: FulcrumIdSchema,
  title: z.string(),
  descriptionSnapshot: z.string().optional(),
  status: TaskStatusSchema,
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  labels: z.array(z.string()).default([]),
  blockerState: z.string().optional(),
  currentRunId: FulcrumIdSchema.optional()
});

export const ExternalWorkItemMirrorSchema = BaseEntitySchema.extend({
  mirrorId: FulcrumIdSchema,
  taskId: FulcrumIdSchema,
  adapterId: FulcrumIdSchema,
  externalSystem: z.string(),
  externalId: z.string(),
  externalUrl: z.string().optional(),
  sourceTitle: z.string(),
  sourceBodySnapshot: z.string().optional(),
  sourceStatus: z.string().optional(),
  sourceUpdatedAt: TimestampSchema.optional(),
  syncStatus: SyncStatusSchema,
  conflictStatus: z.enum(["none", "local_remote", "status_mapping"]).default("none"),
  lastImportAt: TimestampSchema.optional(),
  lastWritebackAt: TimestampSchema.optional(),
  writebackPreviewId: FulcrumIdSchema.optional(),
  lastFailure: z.string().optional(),
  provenance: z.record(z.unknown()).default({})
});

export const RunSchema = BaseEntitySchema.extend({
  runId: FulcrumIdSchema,
  taskId: FulcrumIdSchema,
  projectId: FulcrumIdSchema,
  agentId: FulcrumIdSchema,
  commandIdentity: z.string(),
  status: RunStatusSchema,
  startedAt: TimestampSchema.optional(),
  endedAt: TimestampSchema.optional(),
  heartbeatAt: TimestampSchema.optional(),
  heartbeatState: z.enum(["fresh", "stale", "missing"]).default("missing"),
  worktreeId: FulcrumIdSchema.optional(),
  contextPackId: FulcrumIdSchema.optional(),
  eventStreamId: FulcrumIdSchema.optional(),
  logArtifactIds: z.array(FulcrumIdSchema).default([]),
  artifactIds: z.array(FulcrumIdSchema).default([]),
  qualityGateIds: z.array(FulcrumIdSchema).default([]),
  policyDecisionIds: z.array(FulcrumIdSchema).default([]),
  summary: z.string().optional(),
  failureReason: z.string().optional(),
  finalOutcome: z.string().optional(),
  terminalStateRecordedAt: TimestampSchema.optional(),
  redactionStatus: RedactionStatusSchema
});

export const ContextPackSchema = BaseEntitySchema.extend({
  contextPackId: FulcrumIdSchema,
  projectId: FulcrumIdSchema,
  taskId: FulcrumIdSchema,
  runId: FulcrumIdSchema.optional(),
  status: z.enum(["building", "ready", "degraded", "failed"]),
  generatedAt: TimestampSchema.optional(),
  budget: z.number().int().positive(),
  budgetUsed: z.number().int().nonnegative(),
  laneSummaries: z
    .array(
      z.object({
        lane: z.string(),
        included: z.number().int().nonnegative(),
        budgetUsed: z.number().int().nonnegative(),
        budgetLimit: z.number().int().nonnegative()
      })
    )
    .default([]),
  omissions: z
    .array(
      z.object({
        lane: z.string(),
        reason: z.string(),
        omittedRef: SourceRefSchema.optional()
      })
    )
    .default([]),
  degradedLanes: z
    .array(
      z.object({
        lane: z.string(),
        cause: z.string(),
        fallback: z.string().optional()
      })
    )
    .default([]),
  freshness: TimestampSchema.optional(),
  exportRefs: z.array(SourceRefSchema).default([]),
  policyDecisionIds: z.array(FulcrumIdSchema).default([]),
  redactionStatus: RedactionStatusSchema
});

export const ContextItemSchema = BaseEntitySchema.extend({
  contextItemId: FulcrumIdSchema,
  contextPackId: FulcrumIdSchema,
  lane: z.string(),
  type: z.string(),
  sourceRef: SourceRefSchema,
  title: z.string(),
  excerptRef: z.string().optional(),
  inclusionReason: z.string(),
  freshness: TimestampSchema,
  evidenceType: z.enum([
    "task",
    "memory",
    "exact_code",
    "path",
    "structural",
    "repo_map",
    "recent_run",
    "artifact",
    "quality_gate",
    "policy",
    "operator_note",
    "graph",
    "semantic",
    "fallback"
  ]),
  confidence: z.number().min(0).max(1).optional(),
  limitation: z.string().optional(),
  toolIdentity: z.string().optional(),
  budgetEstimate: z.number().int().nonnegative(),
  rank: z.number().int().nonnegative(),
  redactionStatus: RedactionStatusSchema,
  linkedRefs: z.array(SourceRefSchema).default([])
});

export const MemoryEntrySchema = BaseEntitySchema.extend({
  memoryId: FulcrumIdSchema,
  projectId: FulcrumIdSchema,
  status: MemoryStatusSchema,
  title: z.string(),
  bodyRef: z.string(),
  excerpt: z.string().optional(),
  sourceRefs: z.array(SourceRefSchema).min(1),
  linkedTaskIds: z.array(FulcrumIdSchema).default([]),
  linkedRunIds: z.array(FulcrumIdSchema).default([]),
  linkedFileRefs: z.array(SourceRefSchema).default([]),
  linkedSymbolRefs: z.array(SourceRefSchema).default([]),
  linkedArtifactIds: z.array(FulcrumIdSchema).default([]),
  backend: z.string(),
  freshness: z.enum(["fresh", "stale", "needs_review"]).default("fresh"),
  approvedBy: z.string().optional(),
  exportStatus: z.enum(["not_exported", "exported", "blocked"]).default("not_exported"),
  redactionStatus: RedactionStatusSchema
});

export const CodeEvidenceSchema = z.object({
  evidenceId: FulcrumIdSchema,
  projectId: FulcrumIdSchema,
  query: z.string(),
  evidenceType: z.enum([
    "exact_identifier",
    "exact_string",
    "path",
    "filename",
    "error",
    "symbol",
    "import",
    "export",
    "structural",
    "semantic"
  ]),
  filePath: z.string(),
  lineStart: z.number().int().positive().optional(),
  lineEnd: z.number().int().positive().optional(),
  symbol: z.string().optional(),
  sourceTool: z.string(),
  ignoredPathStatus: z.enum(["honored", "excluded", "not_ignored"]),
  freshness: z.string(),
  rank: z.number().int().nonnegative(),
  reason: z.string(),
  durationMs: z.number().int().nonnegative(),
  linkedContextItemIds: z.array(FulcrumIdSchema).default([]),
  createdAt: TimestampSchema,
  staleAt: TimestampSchema.optional()
});

export const WorktreeAllocationSchema = BaseEntitySchema.extend({
  worktreeId: FulcrumIdSchema,
  projectId: FulcrumIdSchema,
  taskId: FulcrumIdSchema,
  runId: FulcrumIdSchema.optional(),
  path: z.string(),
  branch: z.string(),
  baseBranch: z.string(),
  baseCommit: z.string().optional(),
  status: WorktreeStatusSchema,
  dirtyState: z.enum(["clean", "dirty", "unknown"]),
  untrackedCount: z.number().int().nonnegative().default(0),
  uncommittedCount: z.number().int().nonnegative().default(0),
  unpushedCommitCount: z.number().int().nonnegative().default(0),
  conflictState: z.enum(["none", "conflicted", "unknown"]).default("unknown"),
  activeRunCount: z.number().int().nonnegative().default(0),
  cleanupEligibility: z.enum(["eligible", "blocked", "requires_approval"]),
  blockReason: z.string().optional(),
  lastCheckedAt: TimestampSchema.optional(),
  cleanedAt: TimestampSchema.optional()
});

export type Project = z.infer<typeof ProjectSchema>;
export type SetupState = z.infer<typeof SetupStateSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type ExternalWorkItemMirror = z.infer<typeof ExternalWorkItemMirrorSchema>;
export type Run = z.infer<typeof RunSchema>;
export type ContextPack = z.infer<typeof ContextPackSchema>;
export type ContextItem = z.infer<typeof ContextItemSchema>;
export type CodeEvidence = z.infer<typeof CodeEvidenceSchema>;
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;
export type WorktreeAllocation = z.infer<typeof WorktreeAllocationSchema>;
