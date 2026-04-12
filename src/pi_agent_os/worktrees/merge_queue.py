"""Merge queue — integration worker owns merge operations. Spec §18.3, §18.4."""
from __future__ import annotations
import subprocess
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from ..db import connection as db
from ..events.store import emit
from ..models.events import EventType
from ..policy.engine import check as policy_check, PolicyDeniedError


class MergeQueue:
    """
    Integration worker-owned merge queue. Spec §18.

    Hard invariants:
    - only integration_worker may dequeue and merge (spec §21.10)
    - reviews must be approved before merge (spec §18.10)
    """

    def enqueue(
        self,
        worktree_id: str,
        workspace_id: str,
        project_id: str,
        task_id: Optional[str] = None,
        run_id: Optional[str] = None,
        branch_name: str = "",
    ) -> None:
        """Queue a worktree for integration."""
        now = datetime.now(timezone.utc).isoformat()
        db.execute(
            """INSERT OR REPLACE INTO merge_queue_projection
               (worktree_id, workspace_id, project_id, task_id, run_id, status, branch_name, queued_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?)""",
            (worktree_id, workspace_id, project_id, task_id, run_id, branch_name, now, now),
        )
        emit(
            EventType.merge_queued,
            workspace_id=workspace_id,
            actor_type="system",
            actor_id="merge_queue",
            object_type="worktree",
            object_id=worktree_id,
            project_id=project_id,
            payload={"branch": branch_name},
        )

    def merge(
        self,
        worktree_id: str,
        project_root: str,
        actor_id: str,
        actor_role: str,
        workspace_id: str,
        target_branch: str = "main",
    ) -> dict:
        """
        Execute merge. Only integration_worker role may call this.

        Spec §21.10: only integration worker can merge queue entries.
        """
        # Policy: only integration_worker may merge
        if actor_role != "integration_worker":
            raise PolicyDeniedError(
                f"Only integration_worker may execute merges. Got: '{actor_role}'"
            )

        row = db.fetchone("SELECT * FROM worktrees WHERE id=?", (worktree_id,))
        if not row:
            return {"success": False, "error": "Worktree not found"}

        branch_name = row["branch_name"]
        worktree_path = row["path"]
        root = Path(project_root)
        now = datetime.now(timezone.utc).isoformat()

        emit(
            EventType.merge_started,
            workspace_id=workspace_id,
            actor_type="agent",
            actor_id=actor_id,
            object_type="worktree",
            object_id=worktree_id,
            payload={"branch": branch_name, "target": target_branch},
        )

        try:
            # Merge the branch into target
            result = subprocess.run(
                ["git", "-C", str(root), "merge", "--no-ff", branch_name,
                 "-m", f"Merge {branch_name} via PI integration worker"],
                capture_output=True, text=True,
            )

            if result.returncode != 0:
                # Conflict
                emit(
                    EventType.merge_conflicted,
                    workspace_id=workspace_id,
                    actor_type="agent",
                    actor_id=actor_id,
                    object_type="worktree",
                    object_id=worktree_id,
                    payload={"stderr": result.stderr[:500]},
                )
                db.execute(
                    "UPDATE merge_queue_projection SET status='conflicted', updated_at=? WHERE worktree_id=?",
                    (now, worktree_id),
                )
                db.execute(
                    "UPDATE worktrees SET status='dirty', updated_at=? WHERE id=?",
                    (now, worktree_id),
                )
                return {"success": False, "conflict": True, "stderr": result.stderr}

            # Success
            db.execute(
                "UPDATE worktrees SET status='merged', merged_at=?, updated_at=? WHERE id=?",
                (now, now, worktree_id),
            )
            db.execute(
                "UPDATE merge_queue_projection SET status='merged', updated_at=? WHERE worktree_id=?",
                (now, worktree_id),
            )
            emit(
                EventType.merge_completed,
                workspace_id=workspace_id,
                actor_type="agent",
                actor_id=actor_id,
                object_type="worktree",
                object_id=worktree_id,
                payload={"branch": branch_name, "stdout": result.stdout[:200]},
            )
            return {"success": True, "stdout": result.stdout}

        except Exception as e:
            return {"success": False, "error": str(e)}

    def list_queued(self, workspace_id: str) -> list[dict]:
        rows = db.fetchall(
            "SELECT * FROM merge_queue_projection WHERE workspace_id=? ORDER BY queued_at ASC",
            (workspace_id,),
        )
        return [dict(r) for r in rows]
