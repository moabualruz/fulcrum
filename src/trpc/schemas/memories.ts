/**
 * Zod schemas for the memories domain.
 * Pillar 10 (memory + retrieval) fills these out fully.
 *
 * C6: No raw SQL.
 * C4: Shared across web, CLI, and TUI surfaces.
 */

import { z } from "zod";

/** Memory kind — Pillar 10 extends with vector embedding fields. */
export const MemoryKindSchema = z.enum(["fact", "summary", "episodic", "semantic"]);

/** Minimal Memory output schema — Pillar 10 extends with embedding + retrieval fields. */
export const MemorySchema = z.object({
  id: z.string().uuid().describe("Unique memory record identifier."),
  orgId: z.string().uuid().describe("Organisation that owns the memory."),
  kind: MemoryKindSchema.describe("Kind of memory — fact, summary, episodic, or semantic."),
  content: z.string().describe("Raw text content of the memory."),
  createdAt: z.date().describe("Timestamp when the memory was recorded."),
});

/** Input for listing memories — Pillar 10 adds semantic search. */
export const ListMemoriesInputSchema = z.object({
  orgId: z.string().uuid().optional().describe("Filter by organisation."),
});

export type Memory = z.infer<typeof MemorySchema>;
export type MemoryKind = z.infer<typeof MemoryKindSchema>;
export type ListMemoriesInput = z.infer<typeof ListMemoriesInputSchema>;
