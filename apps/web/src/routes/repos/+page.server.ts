import type { Actions, PageServerLoad } from "./$types";
import { actionOk } from "$lib/feedback/action-result";
import { activeOrgId, publicApiBaseUrl } from "$lib/server/public-api";
import { queueRepositorySync } from "./repository-sync-api";

/**
 * Repos list page. Web is a pure invocation layer: we call the NestJS public
 * API (`/api/v1/repos`) over HTTP instead of going through a second TypeORM
 * DataSource here. Two SSR processes opening the same PGlite data directory
 * end up fighting the single-writer lock and one of them silently observes an
 * empty DB. The server is the single writer; we forward through it.
 */
export const load: PageServerLoad = async (event) => {
  const activeProjectId = event.locals?.activeProjectId ?? null;
  const orgId = activeOrgId(event.locals);

  return {
    activeProjectId,
    streamed: {
      data: (async () => {
        const base = publicApiBaseUrl(event.url);
        const url = new URL("/api/v1/repos", base);
        url.searchParams.set("orgId", orgId);
        const cookie = event.request.headers.get("cookie") ?? "";
        const response = await event.fetch(url.toString(), {
          headers: cookie ? { cookie } : {},
        });
        if (!response.ok) return { repos: [] as RepoPageRow[] };
        const raw = (await response.json()) as unknown;
        const arr = Array.isArray(raw) ? (raw as RepoApiRow[]) : [];
        return { repos: arr.map(toPageRow) };
      })(),
    },
  };
};

export const actions: Actions = {
  sync: async (event) => {
    const form = await event.request.formData();
    const repoId = form.get("repo_id")?.toString() ?? "";
    if (!repoId) return actionOk("No repo id");

    await queueRepositorySync(event, repoId);
    return actionOk("Repo sync queued");
  },
};

interface RepoApiRow {
  id: string;
  slug: string;
  name?: string | null;
  kind?: string | null;
  localPath?: string | null;
  remoteUrl?: string | null;
  currentBranch?: string | null;
  defaultBranch?: string | null;
  lastSyncAt?: string | null;
  syncStatus?: string | null;
}

interface RepoPageRow {
  id: string;
  slug: string;
  path: string;
  remoteUrl: string | null;
  branch: string | null;
  dirty: boolean;
  lastSyncAt: string | null;
  recentCommit: string | null;
  openTaskCount: number;
  health: "healthy" | "stale" | "failed";
  watcherStatus: "unknown";
  syncLatencyMs: number | null;
  lastSyncError: string | null;
}

function toPageRow(repo: RepoApiRow): RepoPageRow {
  const lastSyncAt = repo.lastSyncAt ?? null;
  return {
    id: repo.id,
    slug: repo.slug,
    path: repo.localPath ?? repo.remoteUrl ?? repo.name ?? repo.slug,
    remoteUrl: repo.remoteUrl ?? null,
    branch: repo.currentBranch ?? repo.defaultBranch ?? null,
    dirty: false,
    lastSyncAt,
    recentCommit: null,
    openTaskCount: 0,
    health: repo.syncStatus === "error" ? "failed" : lastSyncAt ? "healthy" : "stale",
    watcherStatus: "unknown",
    syncLatencyMs: null,
    lastSyncError: null,
  };
}
