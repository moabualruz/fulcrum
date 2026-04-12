"""AgentStatusReadAdapter — live queryable status without LLM. Spec §19.8, §24."""
from __future__ import annotations
from datetime import datetime
from typing import Any, Optional
from ...models.agent_run import AgentRun, AgentRunStatus
from ...db import connection as db
from ..base import ReadAdapter
import json


class AgentStatusReadAdapter(ReadAdapter[AgentRun]):
    """Read current status of agent runs. No LLM dependency."""

    def get(self, id: str) -> Optional[AgentRun]:
        row = db.fetchone("SELECT * FROM agent_runs WHERE id=?", (id,))
        return _row_to_run(row) if row else None

    def list(self, filters: dict[str, Any] | None = None, limit: int = 100, offset: int = 0) -> list[AgentRun]:
        f = filters or {}
        clauses, params = [], []
        for col in ("workspace_id", "project_id", "task_id", "status", "agent_id"):
            if col in f:
                clauses.append(f"{col}=?")
                params.append(f[col])
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = db.fetchall(
            f"SELECT * FROM agent_runs {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (*params, limit, offset),
        )
        return [_row_to_run(r) for r in rows]

    def search(self, query: str, filters: dict[str, Any] | None = None) -> list[AgentRun]:
        rows = db.fetchall(
            "SELECT * FROM agent_runs WHERE agent_role LIKE ? OR agent_id LIKE ? LIMIT 50",
            (f"%{query}%", f"%{query}%"),
        )
        return [_row_to_run(r) for r in rows]

    def current(self) -> Optional[AgentRun]:
        """Return the most recently active run."""
        row = db.fetchone(
            "SELECT * FROM agent_runs WHERE status IN ('running','starting','waiting') ORDER BY updated_at DESC LIMIT 1"
        )
        return _row_to_run(row) if row else None

    def active_runs(self, workspace_id: str) -> list[AgentRun]:
        rows = db.fetchall(
            "SELECT * FROM agent_runs WHERE workspace_id=? AND status IN ('running','starting','waiting') ORDER BY updated_at DESC",
            (workspace_id,),
        )
        return [_row_to_run(r) for r in rows]

    def artifacts_for_run(self, run_id: str) -> list[dict]:
        """Return artifacts produced by a run (§24.4)."""
        rows = db.fetchall(
            "SELECT id, display_id, artifact_type, title, path, created_at FROM artifacts WHERE run_id=? ORDER BY created_at",
            (run_id,),
        )
        return [dict(r) for r in rows]

    def session(self, run_id: str) -> dict:
        """Return structured live state for a run (§24.2 level 2)."""
        run = self.get(run_id)
        if run is None:
            return {}
        artifacts = self.artifacts_for_run(run_id)
        events = db.fetchall(
            "SELECT id, evt_type, payload, created_at FROM events WHERE object_id=? ORDER BY created_at DESC LIMIT 20",
            (run_id,),
        )
        return {
            "run": run.model_dump(),
            "artifacts": artifacts,
            "recent_events": [dict(e) for e in events],
        }

    def blockers(self, workspace_id: str) -> list[dict]:
        """Return all blocked runs with their blocker reason."""
        rows = db.fetchall(
            "SELECT id, agent_role, task_id, blocker, updated_at FROM agent_runs WHERE workspace_id=? AND status='blocked'",
            (workspace_id,),
        )
        return [dict(r) for r in rows]

    def heartbeats(self, workspace_id: str, limit: int = 20) -> list[dict]:
        rows = db.fetchall(
            "SELECT id, agent_role, status, heartbeat_at, current_step FROM agent_runs WHERE workspace_id=? ORDER BY heartbeat_at DESC NULLS LAST LIMIT ?",
            (workspace_id, limit),
        )
        return [dict(r) for r in rows]

    def tail(self, limit: int = 50, workspace_id: str | None = None) -> list[AgentRun]:
        if workspace_id:
            rows = db.fetchall(
                "SELECT * FROM agent_runs WHERE workspace_id=? ORDER BY updated_at DESC LIMIT ?",
                (workspace_id, limit),
            )
        else:
            rows = db.fetchall("SELECT * FROM agent_runs ORDER BY updated_at DESC LIMIT ?", (limit,))
        return [_row_to_run(r) for r in rows]


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
