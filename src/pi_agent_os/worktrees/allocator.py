"""Git worktree allocation and lifecycle. Spec §18."""
from __future__ import annotations
import subprocess
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from ..ids import generate_id, WT_PREFIX
from ..models.worktree import Worktree, WorktreeStatus
from ..db import connection as db
from ..events.store import emit
from ..models.events import EventType


class WorktreeAllocator:
    """
    Manages git worktrees for parallel write runs. Spec §18.

    Rules:
    - Worktrees only for parallel git writes (spec §18.1)
    - Short-lived topic branches (spec §18.2)
    - Temporary by default (spec §18.6)
    - Non-git: sequential only (spec §18.7)
    """

    def allocate(
        self,
        project_root: str,
        branch_name: str,
        workspace_id: str,
        project_id: str,
        task_id: Optional[str] = None,
        run_id: Optional[str] = None,
        base_branch: str = "main",
    ) -> Worktree:
        """
        Allocate a new git worktree.

        Lifecycle step 1-2 per spec §18.8:
        1. validate repo state
        2. allocate worktree and branch
        """
        root = Path(project_root)

        # Step 1: Validate repo
        self._validate_repo(root)

        # Step 2: Allocate worktree path
        worktree_id = generate_id(WT_PREFIX)
        worktree_path = root.parent / f".pi-worktrees" / worktree_id
        worktree_path.mkdir(parents=True, exist_ok=True)

        # Create branch and worktree
        full_branch = f"pi/{branch_name}/{worktree_id[-6:]}"
        try:
            subprocess.run(
                ["git", "-C", str(root), "worktree", "add",
                 str(worktree_path), "-b", full_branch, base_branch],
                check=True, capture_output=True, text=True,
            )
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"Failed to allocate worktree: {e.stderr}") from e

        worktree = Worktree(
            worktree_id=worktree_id,
            workspace_id=workspace_id,
            project_id=project_id,
            status=WorktreeStatus.allocated,
            branch_name=full_branch,
            path=str(worktree_path),
            task_id=task_id,
            run_id=run_id,
        )
        _persist_worktree(worktree)
        emit(
            EventType.worktree_allocated,
            workspace_id=workspace_id,
            actor_type="system",
            actor_id="worktree_allocator",
            object_type="worktree",
            object_id=worktree_id,
            project_id=project_id,
            payload={"branch": full_branch, "path": str(worktree_path)},
        )
        return worktree

    def cleanup(self, worktree_id: str, project_root: str, force: bool = False) -> None:
        """
        Clean up a worktree after merge or discard. Spec §18.8 step 7.
        """
        row = db.fetchone("SELECT * FROM worktrees WHERE id=?", (worktree_id,))
        if not row:
            return

        worktree_path = row["path"]
        root = Path(project_root)

        try:
            subprocess.run(
                ["git", "-C", str(root), "worktree", "remove",
                 worktree_path, "--force" if force else ""],
                check=True, capture_output=True, text=True,
            )
        except subprocess.CalledProcessError:
            pass  # Best effort cleanup

        now = datetime.now(timezone.utc).isoformat()
        db.execute(
            "UPDATE worktrees SET status=?, discarded_at=?, updated_at=? WHERE id=?",
            ("discarded", now, now, worktree_id),
        )

    def _validate_repo(self, root: Path) -> None:
        """Spec §18.9: validate repo exists and is in clean state for worktree ops."""
        if not (root / ".git").exists():
            raise ValueError(f"Not a git repository: {root}")

        result = subprocess.run(
            ["git", "-C", str(root), "status", "--porcelain"],
            capture_output=True, text=True,
        )
        # We allow worktrees even with local changes; strict mode would check here
        # For now just verify the repo is accessible
        if result.returncode != 0:
            raise RuntimeError(f"Git repo not accessible: {result.stderr}")

    def get_worktree(self, worktree_id: str) -> Optional[Worktree]:
        row = db.fetchone("SELECT * FROM worktrees WHERE id=?", (worktree_id,))
        return _row_to_worktree(row) if row else None

    def list_for_project(self, project_id: str) -> list[Worktree]:
        rows = db.fetchall(
            "SELECT * FROM worktrees WHERE project_id=? ORDER BY created_at DESC",
            (project_id,),
        )
        return [_row_to_worktree(r) for r in rows]


def _persist_worktree(wt: Worktree) -> None:
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        """INSERT INTO worktrees
           (id, workspace_id, project_id, status, branch_name, path, task_id, run_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            wt.worktree_id, wt.workspace_id, wt.project_id,
            wt.status.value if hasattr(wt.status, 'value') else str(wt.status),
            wt.branch_name, wt.path, wt.task_id, wt.run_id, now, now,
        ),
    )


def _row_to_worktree(row: Any) -> Worktree:
    return Worktree(
        worktree_id=row["id"],
        workspace_id=row["workspace_id"],
        project_id=row["project_id"],
        status=WorktreeStatus(row["status"]),
        branch_name=row["branch_name"],
        path=row["path"],
        task_id=row["task_id"],
        run_id=row["run_id"],
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
        merged_at=datetime.fromisoformat(row["merged_at"]) if row["merged_at"] else None,
        discarded_at=datetime.fromisoformat(row["discarded_at"]) if row["discarded_at"] else None,
    )
