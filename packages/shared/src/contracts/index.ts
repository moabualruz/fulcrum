export * from "./common.js";
import { z } from "zod";
import { FulcrumIdSchema, SchemaVersionSchema } from "../ids.js";
import { CapabilityStateSchema, PolicyDecisionStatusSchema } from "../lifecycle.js";
import {
  DegradedStateSchema,
  FulcrumErrorSchema,
  PrivacyModeSchema,
  RedactionStatusSchema,
  SourceRefSchema
} from "./common.js";

export const CLI_COMMANDS = [
  "setup",
  "doctor",
  "repair",
  "uninstall",
  "project",
  "task",
  "run",
  "context",
  "memory",
  "code",
  "worktree",
  "gate",
  "artifact",
  "policy",
  "adapter",
  "backup",
  "restore",
  "rebuild",
  "export",
  "reset"
] as const;

export const API_BASE_PATH = "/api/v1";

export const CliCommandSchema = z.enum(CLI_COMMANDS);

export const CliGlobalFlagsSchema = z.object({
  json: z.boolean().default(false),
  configPath: z.string().optional(),
  projectId: FulcrumIdSchema.optional(),
  taskId: FulcrumIdSchema.optional(),
  runId: FulcrumIdSchema.optional(),
  localOnly: z.boolean().default(false),
  preview: z.boolean().default(false),
  dryRun: z.boolean().default(false),
  yes: z.boolean().default(false),
  verbose: z.boolean().default(false),
  noColor: z.boolean().default(false)
});

export const CliExitCodeSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4)
]);

export const ApiEndpointSchema = z.enum([
  "GET /api/v1/setup/preview",
  "POST /api/v1/setup/apply",
  "GET /api/v1/doctor",
  "GET /api/v1/privacy/status",
  "GET /api/v1/projects",
  "POST /api/v1/projects",
  "GET /api/v1/projects/{projectId}",
  "GET /api/v1/projects/{projectId}/health",
  "GET /api/v1/tasks",
  "POST /api/v1/tasks",
  "GET /api/v1/tasks/{taskId}",
  "POST /api/v1/tasks/{taskId}/transition",
  "GET /api/v1/queues/review",
  "GET /api/v1/queues/merge",
  "GET /api/v1/queues/policy",
  "POST /api/v1/runs",
  "GET /api/v1/runs/{runId}",
  "POST /api/v1/runs/{runId}/cancel",
  "GET /api/v1/runs/{runId}/events",
  "GET /api/v1/activity",
  "POST /api/v1/context-packs",
  "GET /api/v1/context-packs/{contextPackId}",
  "GET /api/v1/memory/search",
  "POST /api/v1/memory/drafts",
  "GET /api/v1/code/search",
  "GET /api/v1/worktrees/{worktreeId}",
  "POST /api/v1/worktrees/{worktreeId}/cleanup-preview",
  "POST /api/v1/worktrees/{worktreeId}/cleanup",
  "GET /api/v1/artifacts/{artifactId}",
  "POST /api/v1/quality/run",
  "POST /api/v1/policy/check",
  "POST /api/v1/policy/{decisionId}/approve",
  "GET /api/v1/adapters",
  "GET /api/v1/adapters/health",
  "POST /api/v1/adapters/{adapterId}/health-check",
  "POST /api/v1/adapters/{adapterId}/enable",
  "POST /api/v1/adapters/{adapterId}/disable",
  "GET /api/v1/backups",
  "POST /api/v1/backups",
  "POST /api/v1/restore",
  "POST /api/v1/rebuild",
  "POST /api/v1/exports/preview",
  "POST /api/v1/exports",
  "POST /api/v1/reset/preview",
  "POST /api/v1/uninstall/preview",
  "GET /api/v1/external-pm/mirrors",
  "POST /api/v1/external-pm/import",
  "POST /api/v1/external-pm/writeback-preview",
  "POST /api/v1/external-pm/disable",
  "GET /api/v1/external-pm/health"
]);

export const MCP_TOOL_NAMES = [
  "fulcrum_doctor_status",
  "fulcrum_project_list",
  "fulcrum_task_get",
  "fulcrum_task_claim",
  "fulcrum_task_update_status",
  "fulcrum_task_list",
  "fulcrum_run_start",
  "fulcrum_run_heartbeat",
  "fulcrum_run_event",
  "fulcrum_run_complete",
  "fulcrum_context_build",
  "fulcrum_context_get",
  "fulcrum_context_explain",
  "fulcrum_memory_search",
  "fulcrum_memory_add",
  "fulcrum_code_search",
  "fulcrum_repo_map_get",
  "fulcrum_repomix_pack",
  "fulcrum_worktree_allocate",
  "fulcrum_worktree_status",
  "fulcrum_artifact_attach",
  "fulcrum_quality_gate_run",
  "fulcrum_policy_check"
] as const;

export const McpToolNameSchema = z.enum(MCP_TOOL_NAMES);

export const ArtifactTypeSchema = z.enum([
  "log",
  "transcript",
  "context",
  "quality_output",
  "diff",
  "screenshot",
  "report",
  "export",
  "backup",
  "memory_source",
  "code_evidence",
  "other"
]);

export const ArtifactContractSchema = z.object({
  artifactId: FulcrumIdSchema,
  type: ArtifactTypeSchema,
  localRef: z.string(),
  summary: z.string(),
  hash: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  projectId: FulcrumIdSchema.optional(),
  taskId: FulcrumIdSchema.optional(),
  runId: FulcrumIdSchema.optional(),
  sourceRefs: z.array(SourceRefSchema).default([]),
  linkedRefs: z.array(SourceRefSchema).default([]),
  storageRef: z.string(),
  retention: z.enum(["keep", "delete_after_export", "operator_managed"]).default("keep"),
  redactionStatus: RedactionStatusSchema,
  provenance: z.object({
    capturedBy: z.string(),
    capturedAt: z.string(),
    toolIdentity: z.string().optional()
  }),
  schemaVersion: SchemaVersionSchema
});

export const AdapterCategorySchema = z.enum([
  "external_pm",
  "memory",
  "code_tool",
  "semantic_search",
  "repo_map",
  "cli_agent",
  "quality_gate",
  "telemetry",
  "remote_provider",
  "packaging"
]);

export const AdapterMetadataSchema = z.object({
  adapterId: FulcrumIdSchema,
  category: AdapterCategorySchema,
  name: z.string(),
  enabled: z.boolean(),
  ownershipBoundary: z.string(),
  networkRequired: z.boolean(),
  credentialStatus: z.enum(["not_configured", "configured", "missing", "invalid", "not_required"]),
  privacyNotes: z.string(),
  offlineBehavior: z.string(),
  disablementBehavior: z.string(),
  importExportStrategy: z.string(),
  rebuildStrategy: z.string()
});

export const CapabilityHealthRecordSchema = z.object({
  capabilityId: FulcrumIdSchema,
  state: CapabilityStateSchema,
  blocking: z.boolean(),
  cause: z.string().optional(),
  nextAction: z.string().optional(),
  privacyStatus: PrivacyModeSchema,
  affectedWorkflows: z.array(z.string()).default([]),
  freshness: z.string()
});

export const PolicyActionSchema = z.enum([
  "destructive",
  "remote_provider",
  "remote_pm",
  "remote_model",
  "telemetry",
  "remote_observability",
  "permanent_memory",
  "public_bind",
  "arbitrary_shell",
  "backup_purge",
  "sensitive_export",
  "worktree_cleanup",
  "external_writeback",
  "quality_gate",
  "memory_delete",
  "adapter_execute",
  "package_global_mutation",
  "release_validation",
  "adapter_certification",
  "compliance_override"
]);

export const PolicyCheckRequestSchema = z.object({
  action: PolicyActionSchema,
  subjectType: z.string(),
  subjectId: z.string(),
  requester: z.string(),
  projectId: FulcrumIdSchema.optional(),
  runId: FulcrumIdSchema.optional(),
  taskId: FulcrumIdSchema.optional(),
  preview: z.boolean().default(false),
  localOnly: z.boolean().default(true),
  previewRef: z.string().optional()
});

export const PolicyDecisionSchema = z.object({
  policyDecisionId: FulcrumIdSchema,
  action: PolicyActionSchema,
  subjectType: z.string(),
  subjectId: z.string(),
  requester: z.string(),
  projectId: FulcrumIdSchema.optional(),
  taskId: FulcrumIdSchema.optional(),
  runId: FulcrumIdSchema.optional(),
  status: PolicyDecisionStatusSchema,
  approvalRequired: z.boolean().default(false),
  reason: z.string(),
  approvedBy: z.string().optional(),
  approvalTime: z.string().optional(),
  auditEventId: FulcrumIdSchema.optional(),
  bypassScope: z.string().optional(),
  expiresAt: z.string().optional(),
  previewRef: z.string().optional(),
  createdAt: z.string(),
  nextAction: z.string().optional(),
  redactionStatus: RedactionStatusSchema
});

export const CommonToolResponseSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  requestId: FulcrumIdSchema,
  status: z.enum(["ok", "error"]),
  data: z.unknown().optional(),
  error: FulcrumErrorSchema.optional(),
  degraded: z.array(DegradedStateSchema).default([]),
  policyDecisionIds: z.array(FulcrumIdSchema).default([]),
  redactionStatus: RedactionStatusSchema
});

export type ArtifactContract = z.infer<typeof ArtifactContractSchema>;
export type AdapterMetadata = z.infer<typeof AdapterMetadataSchema>;
export type CapabilityHealthRecord = z.infer<typeof CapabilityHealthRecordSchema>;
export type PolicyCheckRequest = z.infer<typeof PolicyCheckRequestSchema>;
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;
