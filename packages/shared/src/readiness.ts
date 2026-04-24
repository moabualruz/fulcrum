import { z } from "zod";
import { FulcrumIdSchema, SchemaVersionSchema, TimestampSchema } from "./ids.js";
import { RedactionStatusSchema, SourceRefSchema } from "./contracts/common.js";

const EvidenceRefSchema = z.string().min(1);
const JsonObjectSchema = z.record(z.unknown());

export const ComplianceRequirementStatusSchema = z.enum([
  "implemented",
  "partial",
  "missing",
  "deferred",
  "superseded",
  "mock_only",
  "preview_only",
  "documentation_only"
]);

export const ComplianceRequirementSchema = z.object({
  requirementId: z.string().min(1),
  sourceFile: z.string().min(1),
  sourceLine: z.union([z.number().int().positive(), z.string().min(1)]),
  text: z.string().min(1),
  priority: z.enum(["P1", "P2", "P3", "release", "optional"]).default("P1"),
  supersededBy: z.string().optional(),
  status: ComplianceRequirementStatusSchema,
  implementationRefs: z.array(z.string()).default([]),
  testRefs: z.array(z.string()).default([]),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
  nextAction: z.string().min(1),
  createdAt: TimestampSchema.optional(),
  updatedAt: TimestampSchema.optional(),
  schemaVersion: SchemaVersionSchema.default("1.0")
});

export const InstallTargetSchema = z.object({
  targetId: z.string().min(1),
  command: z.string().min(1),
  runtime: z.enum(["Node", "Bun", "pnpm", "npm", "package-runner", "binary"]),
  artifactPath: z.string().optional(),
  requiredCapabilities: z.array(z.string()).default([]),
  status: z.enum(["managed", "guided", "blocked", "degraded", "optional"]),
  validationEvidence: z.array(EvidenceRefSchema).default([]),
  createdAt: TimestampSchema.optional(),
  updatedAt: TimestampSchema.optional(),
  schemaVersion: SchemaVersionSchema.default("1.0")
});

export const CanonicalMigrationRecordSchema = z.object({
  migrationId: FulcrumIdSchema,
  sourceKind: z.enum(["JSON work-state", "setup-state", "adapter-state", "cache"]),
  sourcePath: z.string().min(1),
  backupPath: z.string().optional(),
  entityCounts: z.record(z.number().int().nonnegative()).default({}),
  checksum: z.string().min(1),
  status: z.enum(["pending", "imported", "verified", "failed", "rolled_back"]),
  startedAt: TimestampSchema,
  completedAt: TimestampSchema.optional(),
  repairAction: z.string().optional(),
  schemaVersion: SchemaVersionSchema.default("1.0")
});

export const CapabilityProbeSchema = z.object({
  capabilityId: FulcrumIdSchema,
  name: z.string().min(1),
  mode: z.enum(["quick", "deep", "project", "network"]),
  probeKind: z.enum(["command", "file", "sqlite", "api", "env", "config", "policy"]),
  command: z.string().optional(),
  target: z.string().optional(),
  blockingRule: z.string().min(1),
  privacyStatus: z.enum(["local_only", "local_first", "operator_configured"]),
  affectedWorkflows: z.array(z.string()).default([]),
  nextActionTemplate: z.string().min(1),
  createdAt: TimestampSchema.optional(),
  updatedAt: TimestampSchema.optional(),
  schemaVersion: SchemaVersionSchema.default("1.0")
});

export const AgentCertificationSchema = z.object({
  agentId: FulcrumIdSchema,
  command: z.string().min(1),
  version: z.string().optional(),
  authStatus: z.enum(["not_required", "configured", "missing", "invalid", "unknown"]),
  enabled: z.boolean(),
  roles: z.array(z.string()).default([]),
  promptMechanisms: z.array(z.string()).default([]),
  mcpStatus: z.enum(["supported", "unsupported", "not_configured", "unknown"]),
  hookStatus: z.enum(["supported", "unsupported", "not_configured", "unknown"]),
  localOnlyBehavior: z.string().min(1),
  acceptanceRunIds: z.array(FulcrumIdSchema).default([]),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
  status: z.enum(["certified", "degraded", "blocked", "optional", "unknown"]),
  createdAt: TimestampSchema.optional(),
  updatedAt: TimestampSchema.optional(),
  schemaVersion: SchemaVersionSchema.default("1.0")
});

export const AdapterCertificationSchema = z.object({
  adapterId: FulcrumIdSchema,
  category: z.string().min(1),
  enabled: z.boolean(),
  testMode: z.enum(["real", "simulated", "disabled"]),
  credentialStatus: z.enum(["not_required", "configured", "missing", "invalid", "unknown"]),
  ownershipBoundary: z.string().min(1),
  offlineBehavior: z.string().min(1),
  disablementBehavior: z.string().min(1),
  importExportStrategy: z.string().min(1),
  rebuildStrategy: z.string().min(1),
  privacyNotes: z.string().min(1),
  healthEvidence: z.array(EvidenceRefSchema).default([]),
  status: z.enum(["certified", "degraded", "blocked", "optional", "unknown"]),
  createdAt: TimestampSchema.optional(),
  updatedAt: TimestampSchema.optional(),
  schemaVersion: SchemaVersionSchema.default("1.0")
});

export const InvalidationRecordSchema = z.object({
  recordId: FulcrumIdSchema,
  derivedKind: z.enum([
    "repo_map",
    "repo_pack",
    "code_evidence",
    "memory_index",
    "graph_projection",
    "context_preview",
    "ranking"
  ]),
  sourceRefs: z.array(SourceRefSchema).default([]),
  repoHead: z.string().optional(),
  workingTreeSignature: z.string().optional(),
  ignoreConfigHash: z.string().optional(),
  toolVersion: z.string().optional(),
  generatedAt: TimestampSchema,
  staleAt: TimestampSchema.optional(),
  staleReason: z.string().optional(),
  rebuildSource: z.string().min(1),
  schemaVersion: SchemaVersionSchema.default("1.0")
});

export const ReleaseEvidencePackSchema = z.object({
  releaseRunId: FulcrumIdSchema,
  startedAt: TimestampSchema,
  completedAt: TimestampSchema.optional(),
  environment: JsonObjectSchema.default({}),
  commands: z.array(JsonObjectSchema).default([]),
  artifacts: z.array(JsonObjectSchema).default([]),
  logs: z.array(EvidenceRefSchema).default([]),
  complianceSummary: JsonObjectSchema.default({}),
  pass: z.boolean(),
  failures: z.array(z.string()).default([]),
  nextActions: z.array(z.string()).default([]),
  redactionStatus: RedactionStatusSchema.default("not_redacted"),
  schemaVersion: SchemaVersionSchema.default("1.0")
});

export type ComplianceRequirement = z.infer<typeof ComplianceRequirementSchema>;
export type InstallTarget = z.infer<typeof InstallTargetSchema>;
export type CanonicalMigrationRecord = z.infer<typeof CanonicalMigrationRecordSchema>;
export type CapabilityProbe = z.infer<typeof CapabilityProbeSchema>;
export type AgentCertification = z.infer<typeof AgentCertificationSchema>;
export type AdapterCertification = z.infer<typeof AdapterCertificationSchema>;
export type InvalidationRecord = z.infer<typeof InvalidationRecordSchema>;
export type ReleaseEvidencePack = z.infer<typeof ReleaseEvidencePackSchema>;
