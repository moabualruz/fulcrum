import type Database from "better-sqlite3";
import { WorktreeAllocationSchema, type WorktreeAllocation } from "@fulcrum/shared";

type Row = Record<string, unknown>;

function worktreeFromRow(row: Row): WorktreeAllocation {
  return WorktreeAllocationSchema.parse({
    worktreeId: row.worktree_id,
    projectId: row.project_id,
    taskId: row.task_id,
    runId: row.run_id ?? undefined,
    path: row.path,
    branch: row.branch,
    baseBranch: row.base_branch,
    baseCommit: row.base_commit ?? undefined,
    status: row.status,
    dirtyState: row.dirty_state,
    untrackedCount: row.untracked_count,
    uncommittedCount: row.uncommitted_count,
    unpushedCommitCount: row.unpushed_commit_count,
    conflictState: row.conflict_state ?? "unknown",
    activeRunCount: row.active_run_count,
    cleanupEligibility: row.cleanup_eligibility,
    blockReason: row.block_reason ?? undefined,
    lastCheckedAt: row.last_checked_at ?? undefined,
    cleanedAt: row.cleaned_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schemaVersion: row.schema_version
  });
}

export class WorktreeRepository {
  constructor(private readonly db: Database.Database) {}

  save(worktree: WorktreeAllocation): WorktreeAllocation {
    const parsed = WorktreeAllocationSchema.parse(worktree);
    this.db
      .prepare(
        `INSERT INTO worktree_allocations (
          worktree_id, project_id, task_id, run_id, path, branch, base_branch, base_commit,
          status, dirty_state, untracked_count, uncommitted_count, unpushed_commit_count,
          conflict_state, active_run_count, cleanup_eligibility, block_reason, last_checked_at,
          created_at, cleaned_at, updated_at, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(worktree_id) DO UPDATE SET
          run_id = excluded.run_id,
          status = excluded.status,
          dirty_state = excluded.dirty_state,
          untracked_count = excluded.untracked_count,
          uncommitted_count = excluded.uncommitted_count,
          unpushed_commit_count = excluded.unpushed_commit_count,
          conflict_state = excluded.conflict_state,
          active_run_count = excluded.active_run_count,
          cleanup_eligibility = excluded.cleanup_eligibility,
          block_reason = excluded.block_reason,
          last_checked_at = excluded.last_checked_at,
          cleaned_at = excluded.cleaned_at,
          updated_at = excluded.updated_at`
      )
      .run(
        parsed.worktreeId,
        parsed.projectId,
        parsed.taskId,
        parsed.runId ?? null,
        parsed.path,
        parsed.branch,
        parsed.baseBranch,
        parsed.baseCommit ?? null,
        parsed.status,
        parsed.dirtyState,
        parsed.untrackedCount,
        parsed.uncommittedCount,
        parsed.unpushedCommitCount,
        parsed.conflictState,
        parsed.activeRunCount,
        parsed.cleanupEligibility,
        parsed.blockReason ?? null,
        parsed.lastCheckedAt ?? null,
        parsed.createdAt,
        parsed.cleanedAt ?? null,
        parsed.updatedAt,
        parsed.schemaVersion
      );
    return parsed;
  }

  get(worktreeId: string): WorktreeAllocation | undefined {
    const row = this.db
      .prepare("SELECT * FROM worktree_allocations WHERE worktree_id = ?")
      .get(worktreeId);
    return row ? worktreeFromRow(row as Row) : undefined;
  }

  list(projectId?: string): WorktreeAllocation[] {
    const stmt = projectId
      ? this.db.prepare(
          "SELECT * FROM worktree_allocations WHERE project_id = ? ORDER BY created_at DESC"
        )
      : this.db.prepare("SELECT * FROM worktree_allocations ORDER BY created_at DESC");
    return (projectId ? stmt.all(projectId) : stmt.all()).map((row) => worktreeFromRow(row as Row));
  }
}
