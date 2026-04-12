"""AgentRunWriter — manages agent run lifecycle."""
from __future__ import annotations
import json
from datetime import datetime, timezone
from typing import Any, Optional
from ...models.agent_run import AgentRun, AgentRunStatus
from ...db import connection as db
from ...events.store import emit
from ...models.events import EventType
from ..base import WriteAdapter


class AgentRunWriter(WriteAdapter[AgentRun]):
    def create(self, obj: AgentRun) -> AgentRun:
        now = datetime.now(timezone.utc).isoformat()
        db.execute(
            """INSERT INTO agent_runs (id, workspace_id, project_id, task_id, display_id,
               agent_id, agent_role, pi_profile, status, current_step, current_path,
               progress_pct, heartbeat_at, blocker, worktree_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                obj.run_id, obj.workspace_id, obj.project_id, obj.task_id, obj.display_id,
                obj.agent_id, obj.agent_role, obj.pi_profile,
                obj.status.value if hasattr(obj.status, 'value') else str(obj.status),
                obj.current_step, obj.current_path,
                obj.progress_pct,
                obj.heartbeat_at.isoformat() if obj.heartbeat_at else None,
                obj.blocker, obj.worktree_id, now, now,
            ),
        )
        _upsert_agent_state_projection(obj)
        emit(
            EventType.agent_run_created,
            workspace_id=obj.workspace_id,
            actor_type="system",
            actor_id=obj.agent_id,
            object_type="agent_run",
            object_id=obj.run_id,
            project_id=obj.project_id,
            payload={"agent_role": obj.agent_role, "task_id": obj.task_id},
        )
        return obj

    def update(self, id: str, updates: dict[str, Any]) -> Optional[AgentRun]:
        allowed = {
            "status", "current_step", "current_path", "progress_pct",
            "heartbeat_at", "blocker", "worktree_id", "started_at", "finished_at",
        }
        fields: dict[str, Any] = {}
        old_status = None
        for k, v in updates.items():
            if k not in allowed:
                continue
            if k == "status":
                old_row = db.fetchone("SELECT status FROM agent_runs WHERE id=?", (id,))
                if old_row:
                    old_status = old_row["status"]
                fields[k] = v.value if hasattr(v, 'value') else str(v)
            elif k == "heartbeat_at" and v is not None:
                fields[k] = v.isoformat() if hasattr(v, 'isoformat') else str(v)
            else:
                fields[k] = v

        if not fields:
            return None
        fields["updated_at"] = datetime.now(timezone.utc).isoformat()
        set_clause = ", ".join(f"{k}=?" for k in fields)
        db.execute(f"UPDATE agent_runs SET {set_clause} WHERE id=?", (*fields.values(), id))

        row = db.fetchone("SELECT * FROM agent_runs WHERE id=?", (id,))
        if not row:
            return None
        run = _row_to_run(row)
        _upsert_agent_state_projection(run)

        # Emit appropriate event based on new status
        new_status = fields.get("status", old_status)
        event_map = {
            "starting": EventType.agent_run_started,
            "running": EventType.agent_run_started,
            "blocked": EventType.agent_run_blocked,
            "failed": EventType.agent_run_failed,
            "finished": EventType.agent_run_finished,
            "aborted": EventType.agent_run_failed,
        }
        if new_status and new_status != old_status:
            evt_type = event_map.get(new_status, EventType.agent_run_progress)
            emit(
                evt_type,
                workspace_id=run.workspace_id,
                actor_type="agent",
                actor_id=run.agent_id,
                object_type="agent_run",
                object_id=id,
                project_id=run.project_id,
                payload={
                    "status": new_status,
                    "current_step": run.current_step,
                    "blocker": run.blocker,
                },
            )
        return run

    def heartbeat(self, run_id: str, current_step: Optional[str] = None,
                  current_path: Optional[str] = None, progress_pct: Optional[float] = None) -> None:
        """Update heartbeat timestamp and optional live progress fields."""
        updates: dict[str, Any] = {"heartbeat_at": datetime.now(timezone.utc)}
        if current_step is not None:
            updates["current_step"] = current_step
        if current_path is not None:
            updates["current_path"] = current_path
        if progress_pct is not None:
            updates["progress_pct"] = progress_pct
        self.update(run_id, updates)


def _upsert_agent_state_projection(run: AgentRun) -> None:
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        """INSERT OR REPLACE INTO agent_state_projection
           (run_id, workspace_id, project_id, agent_id, agent_role, pi_profile, status,
            task_id, current_step, current_path, progress_pct, heartbeat_at, blocker,
            worktree_id, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            run.run_id, run.workspace_id, run.project_id,
            run.agent_id, run.agent_role, run.pi_profile,
            run.status.value if hasattr(run.status, 'value') else str(run.status),
            run.task_id, run.current_step, run.current_path, run.progress_pct,
            run.heartbeat_at.isoformat() if run.heartbeat_at else None,
            run.blocker, run.worktree_id, now,
        ),
    )


def _row_to_run(row: Any) -> AgentRun:
    return AgentRun(
        run_id=row["id"],
        workspace_id=row["workspace_id"],
        project_id=row["project_id"],
        task_id=row["task_id"],
        display_id=row["display_id"],
        agent_id=row["agent_id"],
        agent_role=row["agent_role"],
        pi_profile=row["pi_profile"],
        status=AgentRunStatus(row["status"]),
        current_step=row["current_step"],
        current_path=row["current_path"],
        progress_pct=row["progress_pct"],
        heartbeat_at=datetime.fromisoformat(row["heartbeat_at"]) if row["heartbeat_at"] else None,
        blocker=row["blocker"],
        worktree_id=row["worktree_id"],
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
        started_at=datetime.fromisoformat(row["started_at"]) if row["started_at"] else None,
        finished_at=datetime.fromisoformat(row["finished_at"]) if row["finished_at"] else None,
    )
