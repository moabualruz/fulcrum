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
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  name: z.string(),
  type: ArtifactTypeSchema,
  createdAt: z.date(),
});

/** Input for listing artifacts — Pillar 9 adds filters/pagination. */
export const ListArtifactsInputSchema = z.object({
  orgId: z.string().uuid().optional(),
});

export type Artifact = z.infer<typeof ArtifactSchema>;
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;
export type ListArtifactsInput = z.infer<typeof ListArtifactsInputSchema>;
