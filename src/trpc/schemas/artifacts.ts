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
  metadataJson: z.record(z.string(), z.unknown()).describe("Artifact metadata."),
  archived: z.boolean().describe("Whether the artifact is archived."),
  retentionUntil: z.date().nullable().describe("Retention deadline, when configured."),
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
  projectId: UuidSchema.optional(),
  runId: UuidSchema.optional(),
  taskId: UuidSchema.optional(),
  archived: z.boolean().optional(),
  mime: z.string().min(1).optional(),
  createdFrom: z.date().optional(),
  createdTo: z.date().optional(),
}).default({});

export const ArtifactIdInputSchema = z.object({
  id: UuidSchema,
});

export const UploadArtifactInputSchema = z.object({
  filename: z.string().min(1),
  mime: z.string().min(1),
  sizeBytes: BigIntStringSchema,
  taskId: UuidSchema.optional(),
  runId: UuidSchema.optional(),
  docId: UuidSchema.optional(),
  projectId: UuidSchema.optional(),
  metadataJson: z.record(z.string(), z.unknown()).optional(),
});

export const DownloadArtifactOutputSchema = z.object({
  artifact: ArtifactSchema,
  url: z.string(),
});

export const DeleteArtifactOutputSchema = z.object({
  ok: z.literal(true),
  id: UuidSchema,
});

export type Artifact = z.infer<typeof ArtifactSchema>;
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;
export type ListArtifactsInput = z.infer<typeof ListArtifactsInputSchema>;
export type UploadArtifactInput = z.infer<typeof UploadArtifactInputSchema>;
