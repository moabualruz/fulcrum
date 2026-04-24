import { z } from "zod";
import { FulcrumIdSchema, SchemaVersionSchema, TimestampSchema } from "./ids.js";
import {
  CapabilityStateSchema,
  MemoryStatusSchema,
  RunStatusSchema,
  SetupStatusSchema,
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
  privacyMode: PrivacyModeSchema,
  healthState: CapabilityStateSchema,
  enabledCapabilities: z.array(FulcrumIdSchema).default([]),
  disabledCapabilities: z.array(FulcrumIdSchema).default([])
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

export const RunSchema = BaseEntitySchema.extend({
  runId: FulcrumIdSchema,
  taskId: FulcrumIdSchema,
  projectId: FulcrumIdSchema,
  agentId: FulcrumIdSchema,
  commandIdentity: z.string(),
  status: RunStatusSchema,
  heartbeatAt: TimestampSchema.optional(),
  worktreeId: FulcrumIdSchema.optional(),
  contextPackId: FulcrumIdSchema.optional(),
  redactionStatus: RedactionStatusSchema
});

export const ContextPackSchema = BaseEntitySchema.extend({
  contextPackId: FulcrumIdSchema,
  projectId: FulcrumIdSchema,
  taskId: FulcrumIdSchema,
  status: z.enum(["building", "ready", "degraded", "failed"]),
  budget: z.number().int().positive(),
  budgetUsed: z.number().int().nonnegative(),
  omissions: z.array(z.string()).default([]),
  redactionStatus: RedactionStatusSchema
});

export const MemoryEntrySchema = BaseEntitySchema.extend({
  memoryId: FulcrumIdSchema,
  projectId: FulcrumIdSchema,
  status: MemoryStatusSchema,
  title: z.string(),
  bodyRef: z.string(),
  sourceRefs: z.array(SourceRefSchema),
  backend: z.string(),
  redactionStatus: RedactionStatusSchema
});

export const WorktreeAllocationSchema = BaseEntitySchema.extend({
  worktreeId: FulcrumIdSchema,
  projectId: FulcrumIdSchema,
  taskId: FulcrumIdSchema,
  path: z.string(),
  branch: z.string(),
  baseBranch: z.string(),
  status: WorktreeStatusSchema,
  dirtyState: z.enum(["clean", "dirty", "unknown"]),
  cleanupEligibility: z.enum(["eligible", "blocked", "requires_approval"])
});

export type Project = z.infer<typeof ProjectSchema>;
export type SetupState = z.infer<typeof SetupStateSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Run = z.infer<typeof RunSchema>;
