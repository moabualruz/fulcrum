/**
 * Zod schemas for the artifacts domain.
 * Pillar 9 (artifact lifecycle) fills these out fully.
 *
 * C6: No raw SQL.
 * C4: Shared across web, CLI, and TUI surfaces.
 */

import { z } from "zod";

/** Artifact media type — Pillar 9 extends with MIME handling. */
export const ArtifactTypeSchema = z.enum([
  "file",
  "image",
  "code",
  "document",
  "data",
]);

const UuidSchema = z.string().uuid();

const BigIntStringSchema = z.string().regex(/^\d+$/);
export const ArtifactPreviewKindSchema = z.enum(["image", "text", "markdown", "code", "download"]);
export const ArtifactRetentionStatusSchema = z.enum(["active", "expired", "archived", "pruned", "forever"]);

export const ArtifactAttestationSchema = z.object({
  subjectDigest: z.string().nullable(),
  predicateType: z.string().nullable(),
  issuer: z.string().nullable(),
  signedAt: z.string().nullable(),
}).nullable();

/** Artifact output schema shared by tRPC, CLI, and TUI. */
export const ArtifactSchema = z.object({
  id: UuidSchema.describe("Unique artifact identifier."),
  orgId: UuidSchema.describe("Organisation that owns the artifact."),
  projectId: UuidSchema.nullable().describe("Project scope, when available."),
  runId: UuidSchema.nullable().describe("Producing run, when available."),
  taskId: UuidSchema.nullable().describe("Linked task, when available."),
  filename: z.string().min(1).describe("Original filename."),
  mime: z.string().min(1).nullable().describe("MIME type, when known."),
  sizeBytes: BigIntStringSchema.describe("File size in bytes, serialized as a decimal string."),
  path: z.string().min(1).describe("Storage backend path."),
  checksumSha256: z.string().min(1).nullable().describe("SHA-256 checksum, when known."),
  digest: z.string().min(1).nullable().default(null).describe("Digest shown to users."),
  metadataJson: z.record(z.string(), z.unknown()).describe("Artifact metadata."),
  archived: z.boolean().describe("Whether the artifact is archived."),
  pruned: z.boolean().default(false).describe("Whether artifact blob was pruned."),
  retentionStatus: ArtifactRetentionStatusSchema.default("active").describe("Retention lifecycle state."),
  retentionUntil: z.date().nullable().describe("Retention deadline, when configured."),
  previewKind: ArtifactPreviewKindSchema.default("download").describe("Inline preview mode."),
  sourcePath: z.string().nullable().default(null).describe("Original harvested source path."),
  sourceGlob: z.string().nullable().default(null).describe("Harvest glob that selected the artifact."),
  harvestedAt: z.string().nullable().default(null).describe("Harvest timestamp."),
  producerKind: z.string().nullable().default(null).describe("Producer kind, usually agent_run."),
  producerId: UuidSchema.nullable().default(null).describe("Producer identifier."),
  edgeId: UuidSchema.nullable().default(null).describe("Run-artifact edge identifier when available."),
  attestation: ArtifactAttestationSchema.default(null).describe("Attestation-ready metadata."),
  createdAt: z.date().describe("Timestamp when the artifact was created."),
});

/** Legacy classification schema retained for generated clients. */
export const LegacyArtifactSchema = z.object({
  id: UuidSchema.describe("Unique artifact identifier."),
  orgId: UuidSchema.describe("Organisation that owns the artifact."),
  name: z.string().describe("Human-readable artifact name."),
  type: ArtifactTypeSchema.describe("Media type category for the artifact."),
  createdAt: z.date().describe("Timestamp when the artifact was created."),
});

/** Input for listing artifacts. */
export const ListArtifactsInputSchema = z.object({
  orgId: UuidSchema.optional().describe("Filter by organisation. Omit for current org."),
  projectId: UuidSchema.optional().describe("Filter by project."),
  runId: UuidSchema.optional().describe("Filter by producing run."),
  taskId: UuidSchema.optional().describe("Filter by linked task."),
  archived: z.boolean().optional().describe("Filter by archive state."),
  mime: z.string().min(1).optional().describe("Filter by MIME type."),
  createdFrom: z.date().optional().describe("Filter artifacts created at or after this timestamp."),
  createdTo: z.date().optional().describe("Filter artifacts created at or before this timestamp."),
}).default({});

export const ArtifactIdInputSchema = z.object({
  id: UuidSchema.describe("Artifact identifier."),
});

export const UploadArtifactInputSchema = z.object({
  filename: z.string().min(1).describe("Original filename."),
  mime: z.string().min(1).describe("MIME type."),
  sizeBytes: BigIntStringSchema.describe("File size in bytes as a decimal string."),
  taskId: UuidSchema.optional().describe("Linked task, when available."),
  runId: UuidSchema.optional().describe("Producing run, when available."),
  docId: UuidSchema.optional().describe("Linked document, when available."),
  projectId: UuidSchema.optional().describe("Project scope, when available."),
  metadataJson: z.record(z.string(), z.unknown()).optional().describe("Artifact metadata."),
});

export const DownloadArtifactOutputSchema = z.object({
  artifact: ArtifactSchema.describe("Artifact metadata."),
  url: z.string().describe("Download URL or storage path."),
});

export const DeleteArtifactInputSchema = z.object({
  id: UuidSchema.describe("Artifact identifier."),
  hard: z.boolean().optional().default(false).describe("Hard-delete: remove from disk + DB row."),
});

export const DeleteArtifactOutputSchema = z.object({
  ok: z.literal(true).describe("Whether deletion completed."),
  id: UuidSchema.describe("Deleted artifact identifier."),
});

export const ArchiveArtifactOutputSchema = z.object({
  ok: z.literal(true).describe("Whether the operation completed."),
  id: UuidSchema.describe("Artifact identifier."),
  archived: z.boolean().describe("Current archive state after the operation."),
});

export type Artifact = z.infer<typeof ArtifactSchema>;
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;
export type ArtifactPreviewKind = z.infer<typeof ArtifactPreviewKindSchema>;
export type ArtifactRetentionStatus = z.infer<typeof ArtifactRetentionStatusSchema>;
export type ListArtifactsInput = z.infer<typeof ListArtifactsInputSchema>;
export type UploadArtifactInput = z.infer<typeof UploadArtifactInputSchema>;
