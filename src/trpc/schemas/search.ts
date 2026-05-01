/**
 * Zod schemas for the search domain.
 * Pillar 12 (unified search + cmd+K) fills these out fully.
 *
 * C6: No raw SQL.
 * C4: Shared across web, CLI, and TUI surfaces.
 */

import { z } from "zod";

/** Search result kind — Pillar 12 extends with ranking + facets. */
export const SearchResultKindSchema = z.enum([
  "task",
  "document",
  "memory",
  "repo",
  "artifact",
  "run",
]);

/** Search query input. */
export const SearchQueryInputSchema = z.object({
  q: z.string().min(1),
  orgId: z.string().uuid().optional(),
  kinds: z.array(SearchResultKindSchema).optional(),
  limit: z.number().int().positive().max(100).optional(),
});

/** Minimal SearchResult output schema — Pillar 12 extends with scoring + snippets. */
export const SearchResultSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  kind: SearchResultKindSchema,
  title: z.string(),
  createdAt: z.date(),
});

export type SearchQueryInput = z.infer<typeof SearchQueryInputSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type SearchResultKind = z.infer<typeof SearchResultKindSchema>;
