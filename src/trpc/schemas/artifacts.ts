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

/** Minimal Artifact output schema — Pillar 9 extends with storage + lifecycle fields. */
export const ArtifactSchema = z.object({
  id: z.string().uuid().describe("Unique artifact identifier."),
  orgId: z.string().uuid().describe("Organisation that owns the artifact."),
  name: z.string().describe("Human-readable artifact name."),
  type: ArtifactTypeSchema.describe("Media type category for the artifact."),
  createdAt: z.date().describe("Timestamp when the artifact was created."),
});

/** Input for listing artifacts — Pillar 9 adds filters/pagination. */
export const ListArtifactsInputSchema = z.object({
  orgId: z.string().uuid().optional().describe("Filter by organisation. Omit for all accessible artifacts."),
});

export type Artifact = z.infer<typeof ArtifactSchema>;
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;
export type ListArtifactsInput = z.infer<typeof ListArtifactsInputSchema>;
