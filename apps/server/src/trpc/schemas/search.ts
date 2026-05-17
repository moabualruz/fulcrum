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
  q: z.string().min(1).describe("Search query string."),
  orgId: z.string().uuid().optional().describe("Restrict search to a specific organisation."),
  kinds: z.array(SearchResultKindSchema).optional().describe("Restrict results to specific resource kinds."),
  limit: z.number().int().positive().max(100).optional().describe("Maximum number of results to return; default 20, max 100."),
});

/** Minimal SearchResult output schema — Pillar 12 extends with scoring + snippets. */
export const SearchResultSchema = z.object({
  id: z.string().uuid().describe("Unique identifier of the matched resource."),
  orgId: z.string().uuid().describe("Organisation that owns the matched resource."),
  kind: SearchResultKindSchema.describe("Resource type of the matched result."),
  title: z.string().describe("Human-readable title of the matched resource."),
  createdAt: z.date().describe("Timestamp when the matched resource was created."),
});

export type SearchQueryInput = z.infer<typeof SearchQueryInputSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type SearchResultKind = z.infer<typeof SearchResultKindSchema>;
