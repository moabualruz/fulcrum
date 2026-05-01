/**
 * Zod schemas for the repos domain.
 * Pillar 8 (repo supervision) fills these out fully.
 *
 * C6: No raw SQL.
 * C4: Shared across web, CLI, and TUI surfaces.
 */

import { z } from "zod";

/** Repo provider — Pillar 8 extends with provider-specific OAuth fields. */
export const RepoProviderSchema = z.enum(["github", "gitlab", "bitbucket", "local"]);

/** Minimal Repo output schema — Pillar 8 extends with supervision + worktree fields. */
export const RepoSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  name: z.string(),
  provider: RepoProviderSchema,
  createdAt: z.date(),
});

/** Input for listing repos — Pillar 8 adds filters/pagination. */
export const ListReposInputSchema = z.object({
  orgId: z.string().uuid().optional(),
});

export type Repo = z.infer<typeof RepoSchema>;
export type RepoProvider = z.infer<typeof RepoProviderSchema>;
export type ListReposInput = z.infer<typeof ListReposInputSchema>;
