"""SyncStateReadAdapter and SyncConflictReadAdapter. Spec §22.7, §22.8."""
from __future__ import annotations
from typing import Any, Optional
from ...db import connection as db
from ..base import ReadAdapter


class SyncStateReadAdapter(ReadAdapter[dict]):
    """
    Read sync state per object. Queryable without LLM (spec §22.7).

    Reads from sync_states table (one row per object per sync_target).
    """

    def get(self, id: str) -> Optional[dict]:
        """Get sync state by object_id (Plane sync target)."""
        row = db.fetchone(
            "SELECT * FROM sync_states WHERE object_id=? AND sync_target='plane'",
            (id,),
        )
        return dict(row) if row else None

    def list(
        self,
        filters: dict[str, Any] | None = None,
        limit: int = 200,
        offset: int = 0,
    ) -> list[dict]:
        f = filters or {}
        clauses: list[str] = []
        params: list = []
        for col in ("workspace_id", "object_type", "sync_status", "sync_target"):
            if col in f:
                clauses.append(f"{col}=?")
                params.append(f[col])
        if "since" in f:
            clauses.append("last_synced_at >= ?")
            params.append(f["since"])
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = db.fetchall(
            f"SELECT * FROM sync_states {where} ORDER BY last_synced_at DESC LIMIT ? OFFSET ?",
            (*params, limit, offset),
        )
        return [dict(r) for r in rows]

    def search(self, query: str, filters: dict[str, Any] | None = None) -> list[dict]:
        rows = db.fetchall(
            "SELECT * FROM sync_states WHERE object_id LIKE ? OR external_id LIKE ? LIMIT 50",
            (f"%{query}%", f"%{query}%"),
        )
        return [dict(r) for r in rows]

    def for_workspace(self, workspace_id: str, **kwargs: Any) -> list[dict]:
        return self.list({"workspace_id": workspace_id})

    def pending(self, workspace_id: str) -> list[dict]:
        """Objects queued for sync but not yet synced."""
        rows = db.fetchall(
            "SELECT * FROM sync_queue WHERE workspace_id=? ORDER BY priority DESC, queued_at ASC",
            (workspace_id,),
        )
        return [dict(r) for r in rows]

    def stale(self, workspace_id: str, max_age_hours: int = 24) -> list[dict]:
        """Synced objects that haven't been refreshed recently."""
        rows = db.fetchall(
            """SELECT * FROM sync_states
               WHERE workspace_id=? AND sync_target='plane'
               AND last_synced_at < datetime('now', ?)
               ORDER BY last_synced_at ASC LIMIT 100""",
            (workspace_id, f"-{max_age_hours} hours"),
        )
        return [dict(r) for r in rows]

    def drift_summary(self, workspace_id: str) -> dict:
        """Summary of sync drift — count by status."""
        rows = db.fetchall(
            """SELECT sync_status, COUNT(*) as count FROM sync_states
               WHERE workspace_id=? AND sync_target='plane'
               GROUP BY sync_status""",
            (workspace_id,),
        )
        summary = {r["sync_status"]: r["count"] for r in rows}
        pending = len(self.pending(workspace_id))
        return {
            "workspace_id": workspace_id,
            "by_status": summary,
            "pending_queue": pending,
            "total": sum(summary.values()),
        }


class SyncConflictReadAdapter(ReadAdapter[dict]):
    """
    Read unresolved sync conflicts. Spec §22.4 (local wins policy).

    Queryable without LLM.
    """

    def get(self, id: str) -> Optional[dict]:
        row = db.fetchone("SELECT * FROM sync_conflicts WHERE id=?", (id,))
        return dict(row) if row else None

    def list(
        self,
        filters: dict[str, Any] | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict]:
        f = filters or {}
        clauses: list[str] = ["sc.resolved_at IS NULL"]
        params: list = []
        if "workspace_id" in f:
            clauses.append("ss.workspace_id=?")
            params.append(f["workspace_id"])
        if "object_type" in f:
            clauses.append("ss.object_type=?")
            params.append(f["object_type"])
        where = "WHERE " + " AND ".join(clauses)
        rows = db.fetchall(
            f"""SELECT sc.*, ss.object_id, ss.object_type, ss.workspace_id
               FROM sync_conflicts sc
               JOIN sync_states ss ON sc.sync_state_id = ss.id
               {where}
               ORDER BY sc.detected_at DESC LIMIT ? OFFSET ?""",
            (*params, limit, offset),
        )
        return [dict(r) for r in rows]

    def search(self, query: str, filters: dict[str, Any] | None = None) -> list[dict]:
        rows = db.fetchall(
            "SELECT * FROM sync_conflicts WHERE id LIKE ? AND resolved_at IS NULL LIMIT 50",
            (f"%{query}%",),
        )
        return [dict(r) for r in rows]

    def for_workspace(self, workspace_id: str, **kwargs: Any) -> list[dict]:
        return self.list({"workspace_id": workspace_id})

    def unresolved_count(self, workspace_id: str) -> int:
        row = db.fetchone(
            """SELECT COUNT(*) as n FROM sync_conflicts sc
               JOIN sync_states ss ON sc.sync_state_id = ss.id
               WHERE ss.workspace_id=? AND sc.resolved_at IS NULL""",
            (workspace_id,),
        )
        return row["n"] if row else 0
