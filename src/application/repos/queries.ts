import type { EntityManager } from "@mikro-orm/postgresql";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Repo } from "../../db/entities/repos/Repo.ts";
import { RepoBranch } from "../../db/entities/repos/RepoBranch.ts";
import { RepoCommit } from "../../db/entities/repos/RepoCommit.ts";
import { RepoTreeEntry } from "../../db/entities/repos/RepoTreeEntry.ts";
import { AppForbiddenError, AppNotFoundError } from "../errors.ts";
import { ormSqlConnection } from "../orm-helpers.ts";
import type { AppContext, RepoDto, RepoTreeEntryDto } from "./types.ts";

const execFileAsync = promisify(execFile);

export async function listRepos(em: EntityManager, ctx: AppContext): Promise<RepoDto[]> {
  return (await em.find(Repo, { org: ctx.orgId, archived: false } as never, { orderBy: { slug: "ASC" } })).map(serializeRepo);
}

export async function getRepo(em: EntityManager, ctx: AppContext, id: string): Promise<RepoDto> {
  const repo = await em.findOne(Repo, { id } as never);
  if (!repo) throw new AppNotFoundError(`Repo not found: ${id}`);
  if (repo.org.id !== ctx.orgId) throw new AppForbiddenError("Repo is outside org scope.");
  return serializeRepo(repo);
}

export async function listRepoTree(em: EntityManager, ctx: AppContext, input: { repoId: string; commitSha: string }): Promise<RepoTreeEntryDto[]> {
  await getRepo(em, ctx, input.repoId);
  return (await em.find(RepoTreeEntry, { org: ctx.orgId, repo: input.repoId, commitSha: input.commitSha } as never, { orderBy: { path: "ASC" } })).map(serializeRepoTreeEntry);
}

export function serializeRepo(repo: Repo): RepoDto {
  return {
    id: repo.id,
    orgId: repo.org.id,
    slug: repo.slug,
    name: repo.name,
    kind: repo.kind,
    localPath: repo.localPath ?? null,
    remoteUrl: repo.remoteUrl ?? null,
    defaultBranch: repo.defaultBranch ?? null,
    currentBranch: repo.currentBranch ?? null,
    lastSyncAt: repo.lastSyncAt ?? null,
    syncStatus: repo.syncStatus ?? null,
  };
}

export function serializeRepoTreeEntry(row: RepoTreeEntry): RepoTreeEntryDto {
  return { id: row.id, orgId: row.org.id, repoId: row.repo.id, commitSha: row.commitSha, path: row.path, kind: row.kind };
}

export interface ProjectRepoCard {
  id: string;
  name: string;
  slug: string;
  kind: "local" | "remote";
  currentBranch: string | null;
  syncStatus: "idle" | "syncing" | "error";
  remoteUrl: string | null;
  localPath: string | null;
  openTaskCount: number;
  lastCommits: Array<{ subject: string; relativeTime: string }>;
}

interface ProjectRepoRow {
  id: string;
  name: string | null;
  slug: string;
  kind: string | null;
  current_branch: string | null;
  sync_status: string | null;
  remote_url: string | null;
  local_path: string | null;
}

export async function listProjectRepoCards(em: EntityManager, ctx: AppContext): Promise<ProjectRepoCard[]> {
  const rows = await ormSqlConnection(em).execute<ProjectRepoRow[]>(
    `SELECT id, name, slug, kind, current_branch, sync_status, remote_url, local_path
       FROM repos
      WHERE org_id = $1
      ORDER BY name ASC, slug ASC`,
    [ctx.orgId],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name || row.slug,
    slug: row.slug,
    kind: row.kind === "remote" ? "remote" : "local",
    currentBranch: row.current_branch,
    syncStatus: row.sync_status === "syncing" || row.sync_status === "error" ? row.sync_status : "idle",
    remoteUrl: row.remote_url,
    localPath: row.local_path,
    openTaskCount: 0,
    lastCommits: [],
  }));
}

export interface RepoListRow {
  id: string;
  slug: string;
  path: string | null;
  remoteUrl: string | null;
  branch: string | null;
  dirty: boolean;
  lastSyncAt: string | null;
  recentCommit: string | null;
  openTaskCount: number;
  health: string;
  watcherStatus: string;
  syncLatencyMs: number | null;
  lastSyncError: string | null;
}

export async function listRepoPageRows(em: EntityManager, ctx: AppContext): Promise<RepoListRow[]> {
  const db = em.getKysely<any>();
  const repos = await db
    .selectFrom("repos as r")
    .select([
      "r.id as id",
      "r.slug as slug",
      "r.local_path as localPath",
      "r.remote_url as remoteUrl",
      "r.name as name",
      "r.current_branch as currentBranch",
      "r.default_branch as defaultBranch",
      "r.last_sync_at as lastSyncAt",
      "r.sync_status as syncStatus",
    ])
    .where("r.org_id", "=", ctx.orgId)
    .where("r.archived", "=", false)
    .orderBy("r.last_touched_at", "desc")
    .orderBy("r.id", "asc")
    .execute() as Array<{
      id: string;
      slug: string;
      localPath: string | null;
      remoteUrl: string | null;
      name: string | null;
      currentBranch: string | null;
      defaultBranch: string | null;
      lastSyncAt: Date | string | null;
      syncStatus: string | null;
    }>;

  return await Promise.all(repos.map(async (repo) => {
    const taskCount = await db
      .selectFrom("tasks")
      .select((eb: any) => eb.fn.count("id").as("count"))
      .where("org_id", "=", ctx.orgId)
      .where("repo_id", "=", repo.id)
      .where("status", "not in", ["completed", "cancelled"])
      .executeTakeFirst() as { count?: number | string } | undefined;
    const lastCommit = await db
      .selectFrom("repo_commits")
      .select(["message"])
      .where("org_id", "=", ctx.orgId)
      .where("repo_id", "=", repo.id)
      .orderBy("committed_at", "desc")
      .limit(1)
      .executeTakeFirst() as { message?: string | null } | undefined;
    const lastSyncAt = isoStamp(repo.lastSyncAt);
    return {
      id: repo.id,
      slug: repo.slug,
      path: repo.localPath ?? repo.remoteUrl ?? repo.name ?? repo.slug,
      remoteUrl: repo.remoteUrl,
      branch: repo.currentBranch ?? repo.defaultBranch,
      dirty: false,
      lastSyncAt,
      recentCommit: subject(lastCommit?.message ?? null),
      openTaskCount: Number(taskCount?.count ?? 0),
      health: repo.syncStatus === "error" ? "failed" : lastSyncAt ? "healthy" : "stale",
      watcherStatus: "unknown",
      syncLatencyMs: null,
      lastSyncError: null,
    };
  }));
}

export interface RepoBranchPageData {
  repo: { id: string; name: string; slug: string; currentBranch: string | null };
  writeOpsEnabled: boolean;
  gate: { code: "FEATURE_GATED"; message: string };
  branches: Array<{ name: string; headSha: string | null; isCurrent: boolean; isDefault: boolean }>;
}

export const REPO_WRITE_OPS_GATE = {
  code: "FEATURE_GATED" as const,
  message: "Write operations disabled. Enable repo-write-ops to create, checkout, or delete branches.",
};

export async function isRepoWriteOpsEnabled(em: EntityManager, ctx: AppContext): Promise<boolean> {
  const flag = await em.getKysely<any>()
    .selectFrom("feature_flags")
    .select(["enabled"])
    .where("flag", "=", "repo-write-ops")
    .where("enabled", "=", true)
    .where((eb: any) => eb.or([
      eb("org_id", "=", ctx.orgId),
      eb("org_id", "is", null),
    ]))
    .limit(1)
    .executeTakeFirst() as { enabled?: boolean } | undefined;
  return flag?.enabled === true;
}

export async function getRepoBranchesPage(em: EntityManager, ctx: AppContext, repoId: string): Promise<RepoBranchPageData> {
  const repo = await getRepo(em, ctx, repoId);
  if (repo.syncStatus === "archived") throw new AppNotFoundError(`Repo not found: ${repoId}`);
  const branches = await em.find(RepoBranch, { org: ctx.orgId, repo: repoId } as never, { orderBy: { name: "ASC" } });
  return {
    repo: {
      id: repo.id,
      name: repo.name || repo.slug,
      slug: repo.slug,
      currentBranch: repo.currentBranch ?? null,
    },
    writeOpsEnabled: await isRepoWriteOpsEnabled(em, ctx),
    gate: REPO_WRITE_OPS_GATE,
    branches: branches.map((branch) => ({
      name: branch.name,
      headSha: branch.sha ?? null,
      isCurrent: branch.name === repo.currentBranch,
      isDefault: branch.isDefault === true,
    })),
  };
}

export interface CommitEntry {
  sha: string;
  shortSha: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

export interface RepoCommitsPageData {
  repo: { id: string; slug: string; local_path: string | null; root_path: string | null; default_branch: string | null; last_seen_at: string };
  commits: CommitEntry[];
  page: number;
  totalPages: number;
  total: number;
}

export async function getRepoCommitsPage(
  em: EntityManager,
  ctx: AppContext,
  input: { repoId: string; page: number; pageSize: number },
): Promise<RepoCommitsPageData> {
  const repo = await getRepo(em, ctx, input.repoId);
  const skip = (input.page - 1) * input.pageSize;
  const [commits, total] = await Promise.all([
    listGitCommits(repo.localPath, repo.defaultBranch ?? repo.currentBranch ?? null, skip, input.pageSize),
    countGitCommits(repo.localPath, repo.defaultBranch ?? repo.currentBranch ?? null),
  ]);
  return {
    repo: {
      id: repo.id,
      slug: repo.slug,
      local_path: repo.localPath,
      root_path: repo.localPath,
      default_branch: repo.defaultBranch ?? null,
      last_seen_at: isoStamp(repo.lastSyncAt) ?? "",
    },
    commits,
    page: input.page,
    totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
    total,
  };
}

export interface RepoCommitDetailData {
  repo: { id: string; name: string; slug: string };
  commit: { sha: string; subject: string; author: string | null; committedAt: string | null };
  diff: { raw: string; html: string; filesChanged: number; insertions: number; deletions: number };
}

export async function getRepoCommitDetail(
  em: EntityManager,
  ctx: AppContext,
  input: { repoId: string; sha: string; view: "split" | "unified" },
): Promise<RepoCommitDetailData> {
  const repo = await getRepo(em, ctx, input.repoId);
  const commit = await em.findOne(RepoCommit, { org: ctx.orgId, repo: input.repoId, sha: input.sha } as never);
  const gitCommit = commit ? null : await readGitCommit(repo.localPath, input.sha);
  const resolved = commit ?? gitCommit;
  if (!resolved) throw new AppNotFoundError("commit not found");
  const message = resolved.message ?? "";
  const raw = await readGitDiff(repo.localPath, input.sha);
  return {
    repo: { id: repo.id, name: repo.name || repo.slug, slug: repo.slug },
    commit: {
      sha: resolved.sha,
      subject: subject(message) ?? "(no subject)",
      author: resolved.author ?? null,
      committedAt: isoStamp(resolved.committedAt ?? null),
    },
    diff: {
      raw,
      html: renderDiffHtml(raw, input.view),
      ...diffStats(raw),
    },
  };
}

async function listGitCommits(rootPath: string | null | undefined, branch: string | null, skip: number, limit: number): Promise<CommitEntry[]> {
  if (!rootPath) return [];
  try {
    const ref = branch ?? "HEAD";
    const { stdout } = await execFileAsync("git", [
      "-C", rootPath,
      "log", ref,
      `--max-count=${limit}`,
      `--skip=${skip}`,
      "--format=%H|%ae|%an|%aI|%s",
    ]);
    return stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha = "", email = "", author = "", date = "", ...rest] = line.split("|");
        return {
          sha: sha.trim(),
          shortSha: sha.trim().slice(0, 8),
          author: author.trim(),
          email: email.trim(),
          date: date.trim(),
          message: rest.join("|").trim(),
        };
      });
  } catch {
    return [];
  }
}

async function countGitCommits(rootPath: string | null | undefined, branch: string | null): Promise<number> {
  if (!rootPath) return 0;
  try {
    const ref = branch ?? "HEAD";
    const { stdout } = await execFileAsync("git", ["-C", rootPath, "rev-list", "--count", ref]);
    return parseInt(stdout.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

async function readGitCommit(rootPath: string | null | undefined, sha: string): Promise<{ sha: string; message: string | null; author: string | null; committedAt: Date | string | null } | null> {
  if (!rootPath) return null;
  try {
    const { stdout } = await execFileAsync("git", ["-C", rootPath, "show", "-s", "--format=%H|%an|%aI|%B", sha]);
    const [fullSha = sha, author = "", committedAt = "", ...message] = stdout.split("|");
    return { sha: fullSha.trim(), author: author.trim(), committedAt: committedAt.trim(), message: message.join("|").trim() };
  } catch {
    return null;
  }
}

async function readGitDiff(rootPath: string | null | undefined, sha: string): Promise<string> {
  if (!rootPath) return "";
  try {
    const { stdout } = await execFileAsync("git", ["-C", rootPath, "show", "--format=", "--patch", sha]);
    return stdout;
  } catch {
    return "";
  }
}

function isoStamp(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function subject(message: string | null): string | null {
  if (!message) return null;
  return message.split("\n")[0] || "(no subject)";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function diffStats(diff: string) {
  const files = new Set<string>();
  let insertions = 0;
  let deletions = 0;
  for (const line of diff.split("\n")) {
    const file = /^diff --git a\/(.+?) b\//.exec(line);
    if (file?.[1]) files.add(file[1]);
    if (line.startsWith("+") && !line.startsWith("+++")) insertions += 1;
    if (line.startsWith("-") && !line.startsWith("---")) deletions += 1;
  }
  return { filesChanged: files.size, insertions, deletions };
}

function renderDiffHtml(diff: string, view: string): string {
  const rows = diff.split("\n").map((line) => {
    const cls = line.startsWith("+") ? "ins" : line.startsWith("-") ? "del" : "ctx";
    return `<div data-shiki-line class="d2h-code-line ${cls}"><code>${escapeHtml(line)}</code></div>`;
  }).join("");
  return `<div data-diff2html data-view="${escapeHtml(view)}">${rows}</div>`;
}
