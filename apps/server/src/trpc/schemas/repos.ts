/**
 * Zod schemas for the repos domain.
 * Pillar 8 (repo supervision) fills these out fully.
 *
 * C6: No raw SQL.
 * C4: Shared across web, CLI, and TUI surfaces.
 */

import { z } from "zod";

const UuidLikeSchema = z.string().regex(/^[0-9a-fA-F-]{36}$/);

/** Repo provider — Pillar 8 extends with provider-specific OAuth fields. */
export const RepoProviderSchema = z.enum(["github", "gitlab", "bitbucket", "local"]);

/** Minimal Repo output schema shared by REST, CLI, TUI, and tRPC surfaces. */
export const RepoSchema = z.object({
  id: UuidLikeSchema.describe("Unique repository identifier."),
  orgId: UuidLikeSchema.describe("Organisation that owns the repository."),
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
  includeArchived: z.boolean().optional().default(false).describe("Include archived repositories in the list response."),
}).optional();

export const RepoIdInputSchema = z.object({
  id: UuidLikeSchema.describe("Repository identifier."),
});

export const SyncRepoInputSchema = z.object({
  repoId: UuidLikeSchema.describe("Repository identifier to synchronize."),
});

export const RepoSyncTaskNameSchema = z.enum(["repo.sync.local", "repo.sync.remote"]);
export const RepoApiStatusSchema = z.enum(["queued", "running", "stale", "synced", "failed"]);

export const RepoSyncResultSchema = z.object({
  repoId: UuidLikeSchema.describe("Repository identifier queued for synchronization."),
  status: z.literal("queued").describe("Queue status for the sync request."),
  taskName: RepoSyncTaskNameSchema.describe("Worker task selected for this repository sync."),
  jobKey: z.string().describe("Idempotency key for the queued sync job."),
});

export const RepoStatusResultSchema = z.object({
  repoId: UuidLikeSchema.describe("Repository identifier."),
  orgId: UuidLikeSchema.describe("Organisation that owns the repository."),
  status: RepoApiStatusSchema.describe("Public sync status bucket."),
  syncStatus: z.string().describe("Persisted repository sync status."),
  lastSyncAt: z.date().nullable().describe("Most recent completed sync timestamp."),
  lastTouchedAt: z.date().nullable().describe("Most recent detected repository activity timestamp."),
});

export const RegisterRepoInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("local").describe("Register a local repository path."),
    path: z.string().trim().min(1).describe("Local repository path."),
    name: z.string().trim().min(1).optional().describe("Display name for the repository."),
    slug: z.string().trim().min(1).optional().describe("Org-scoped repository slug."),
  }),
  z.object({
    kind: z.literal("remote").describe("Register a remote repository URL."),
    url: z.string().trim().min(1).describe("Remote repository URL."),
    name: z.string().trim().min(1).optional().describe("Display name for the repository."),
    slug: z.string().trim().min(1).optional().describe("Org-scoped repository slug."),
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
