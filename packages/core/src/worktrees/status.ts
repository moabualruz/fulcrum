import { execFileSync } from "node:child_process";
import { WorktreeAllocationSchema, type Run, type WorktreeAllocation } from "@fulcrum/shared";

export interface WorktreeRepositoryPort {
  save(worktree: WorktreeAllocation): WorktreeAllocation;
  get(worktreeId: string): WorktreeAllocation | undefined;
  list(projectId?: string): WorktreeAllocation[];
}

export interface WorktreeRunPort {
  list(projectId?: string): Run[];
}

export interface WorktreeStatusResult {
  worktree: WorktreeAllocation;
  dirtyFiles: string[];
  untrackedFiles: string[];
  conflictedFiles: string[];
  mergeReadiness: "ready" | "blocked" | "requires_approval";
  mergeBlockReason?: string;
}

export interface WorktreeDiffResult extends WorktreeStatusResult {
  summary: string;
  changedFiles: Array<{ path: string; status: string }>;
}

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function optionalGit(args: string[], cwd: string): string | undefined {
  try {
    return git(args, cwd).trim();
  } catch {
    return undefined;
  }
}

function parsePorcelain(output: string): {
  dirtyFiles: string[];
  untrackedFiles: string[];
  conflictedFiles: string[];
} {
  const dirtyFiles: string[] = [];
  const untrackedFiles: string[] = [];
  const conflictedFiles: string[] = [];

  for (const line of output.split("\n").filter(Boolean)) {
    const status = line.slice(0, 2);
    const file = line.slice(3);
    if (status === "??") {
      untrackedFiles.push(file);
      continue;
    }
    dirtyFiles.push(file);
    if (["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(status)) {
      conflictedFiles.push(file);
    }
  }

  return { dirtyFiles, untrackedFiles, conflictedFiles };
}

function blockReason(parts: string[]): string | undefined {
  return parts.length > 0 ? parts.join("; ") : undefined;
}

function parseNameStatus(output: string): Array<{ path: string; status: string }> {
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, ...paths] = line.split("\t");
      return { status: status ?? "", path: paths.at(-1) ?? "" };
    })
    .filter((file) => file.path.length > 0);
}

export class WorktreeStatusService {
  constructor(
    private readonly worktrees: WorktreeRepositoryPort,
    private readonly runs?: WorktreeRunPort
  ) {}

  inspect(worktreeId: string): WorktreeStatusResult {
    const current = this.requireWorktree(worktreeId);
    const parsed = parsePorcelain(optionalGit(["status", "--porcelain=v1"], current.path) ?? "");
    const unpushedCommitCount = Number(
      optionalGit(["rev-list", "--count", "@{u}..HEAD"], current.path) ??
        optionalGit(["rev-list", "--count", `${current.baseBranch}..HEAD`], current.path) ??
        "0"
    );
    const activeRunCount = this.activeRunCount(current);
    const blockers = [
      parsed.dirtyFiles.length > 0 ? `${parsed.dirtyFiles.length} dirty file(s)` : "",
      parsed.untrackedFiles.length > 0 ? `${parsed.untrackedFiles.length} untracked file(s)` : "",
      parsed.conflictedFiles.length > 0 ? `${parsed.conflictedFiles.length} conflict(s)` : "",
      unpushedCommitCount > 0 ? `${unpushedCommitCount} unpushed commit(s)` : "",
      activeRunCount > 0 ? `${activeRunCount} active run(s)` : ""
    ].filter(Boolean);
    const hasChanges = parsed.dirtyFiles.length + parsed.untrackedFiles.length > 0;
    const nextStatus =
      blockers.length > 0 && current.status === "cleanup_requested"
        ? "cleanup_blocked"
        : current.status;
    const checked = WorktreeAllocationSchema.parse({
      ...current,
      status: nextStatus,
      dirtyState: hasChanges ? "dirty" : "clean",
      untrackedCount: parsed.untrackedFiles.length,
      uncommittedCount: parsed.dirtyFiles.length,
      unpushedCommitCount,
      conflictState: parsed.conflictedFiles.length > 0 ? "conflicted" : "none",
      activeRunCount,
      cleanupEligibility: blockers.length > 0 ? "blocked" : "requires_approval",
      blockReason: blockReason(blockers),
      lastCheckedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    const saved = this.worktrees.save(checked);
    return {
      worktree: saved,
      dirtyFiles: parsed.dirtyFiles,
      untrackedFiles: parsed.untrackedFiles,
      conflictedFiles: parsed.conflictedFiles,
      mergeReadiness: blockers.length > 0 ? "blocked" : "requires_approval",
      mergeBlockReason: blockReason(blockers)
    };
  }

  cleanupPreview(worktreeId: string): WorktreeStatusResult {
    const current = this.requireWorktree(worktreeId);
    this.worktrees.save({
      ...current,
      status: "cleanup_requested",
      updatedAt: new Date().toISOString()
    });
    return this.inspect(worktreeId);
  }

  cleanup(worktreeId: string, input: { approved?: boolean } = {}): WorktreeAllocation {
    const preview = this.cleanupPreview(worktreeId);
    if (preview.worktree.cleanupEligibility === "blocked") {
      throw new Error(`Worktree cleanup blocked: ${preview.worktree.blockReason}`);
    }
    if (!input.approved) {
      throw new Error("Worktree cleanup requires operator approval.");
    }
    git(["worktree", "remove", preview.worktree.path], preview.worktree.path);
    return this.worktrees.save({
      ...preview.worktree,
      status: "cleaned",
      cleanupEligibility: "eligible",
      cleanedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  diff(worktreeId: string): WorktreeDiffResult {
    const inspected = this.inspect(worktreeId);
    const trackedFiles = parseNameStatus(
      optionalGit(["diff", "--name-status", "HEAD"], inspected.worktree.path) ?? ""
    );
    const trackedPaths = new Set(trackedFiles.map((file) => file.path));
    const changedFiles = [
      ...trackedFiles,
      ...inspected.untrackedFiles
        .filter((file) => !trackedPaths.has(file))
        .map((file) => ({ path: file, status: "untracked" }))
    ];
    return {
      ...inspected,
      changedFiles,
      summary: `${changedFiles.length} changed file(s), ${inspected.conflictedFiles.length} conflict(s), ${inspected.worktree.unpushedCommitCount} unpushed commit(s)`
    };
  }

  private activeRunCount(worktree: WorktreeAllocation): number {
    const activeStatuses = new Set([
      "created",
      "starting",
      "running",
      "waiting_for_agent",
      "waiting_for_operator",
      "blocked",
      "cancel_requested"
    ]);
    return (this.runs?.list(worktree.projectId) ?? []).filter(
      (run) => run.worktreeId === worktree.worktreeId && activeStatuses.has(run.status)
    ).length;
  }

  private requireWorktree(worktreeId: string): WorktreeAllocation {
    const worktree = this.worktrees.get(worktreeId);
    if (!worktree) {
      throw new Error(`Worktree not found: ${worktreeId}`);
    }
    return worktree;
  }
}
