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

/** Minimal Repo output schema shared by REST, CLI, TUI, and tRPC surfaces. */
export const RepoSchema = z.object({
  id: z.string().uuid().describe("Unique repository identifier."),
  orgId: z.string().uuid().describe("Organisation that owns the repository."),
  name: z.string().describe("Repository name, typically matching the remote name."),
  slug: z.string().describe("Org-scoped repository slug."),
  kind: z.enum(["local", "remote"]).describe("Repository sync mode."),
  localPath: z.string().nullable().describe("Local filesystem path for local repos."),
  remoteUrl: z.string().nullable().describe("Remote URL for mirrored repos."),
  defaultBranch: z.string().nullable().describe("Default branch name."),
  currentBranch: z.string().nullable().describe("Current branch name."),
  lastSyncAt: z.date().nullable().describe("Most recent completed sync timestamp."),
  syncStatus: z.string().describe("Persisted worker sync status."),
  lastTouchedAt: z.date().nullable().describe("Most recent local/remote activity timestamp."),
  archived: z.boolean().describe("Whether repository is archived."),
});

/** Input for listing repos. Authenticated context supplies org scope. */
export const ListReposInputSchema = z.object({
  includeArchived: z.boolean().optional().default(false),
}).optional();

export const RepoIdInputSchema = z.object({
  id: z.string().uuid(),
});

export const SyncRepoInputSchema = z.object({
  repoId: z.string().uuid(),
});

export const RepoSyncTaskNameSchema = z.enum(["repo.sync.local", "repo.sync.remote"]);
export const RepoApiStatusSchema = z.enum(["queued", "running", "stale", "synced", "failed"]);

export const RepoSyncResultSchema = z.object({
  repoId: z.string().uuid(),
  status: z.literal("queued"),
  taskName: RepoSyncTaskNameSchema,
  jobKey: z.string(),
});

export const RepoStatusResultSchema = z.object({
  repoId: z.string().uuid(),
  orgId: z.string().uuid(),
  status: RepoApiStatusSchema,
  syncStatus: z.string(),
  lastSyncAt: z.date().nullable(),
  lastTouchedAt: z.date().nullable(),
});

export const RegisterRepoInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("local"),
    path: z.string().trim().min(1),
    name: z.string().trim().min(1).optional(),
    slug: z.string().trim().min(1).optional(),
  }),
  z.object({
    kind: z.literal("remote"),
    url: z.string().trim().min(1),
    name: z.string().trim().min(1).optional(),
    slug: z.string().trim().min(1).optional(),
  }),
]);

export type Repo = z.infer<typeof RepoSchema>;
export type RepoProvider = z.infer<typeof RepoProviderSchema>;
export type ListReposInput = z.infer<typeof ListReposInputSchema>;
export type RepoIdInput = z.infer<typeof RepoIdInputSchema>;
export type RegisterRepoInput = z.infer<typeof RegisterRepoInputSchema>;
export type SyncRepoInput = z.infer<typeof SyncRepoInputSchema>;
export type RepoSyncResult = z.infer<typeof RepoSyncResultSchema>;
export type RepoStatusResult = z.infer<typeof RepoStatusResultSchema>;
