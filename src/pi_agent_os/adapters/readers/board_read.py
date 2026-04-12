"""BoardReadAdapter — projection-based board view. Spec §11.2, §11.5."""
from __future__ import annotations
from typing import Any, Optional
from ...db import connection as db
from ..base import ReadAdapter


class BoardReadAdapter(ReadAdapter[dict]):
    """Reads the board_items projection. Board is never canonical truth."""

    def get(self, id: str) -> Optional[dict]:
        row = db.fetchone("SELECT * FROM board_items WHERE id=?", (id,))
        return dict(row) if row else None

    def list(self, filters: dict[str, Any] | None = None, limit: int = 200, offset: int = 0) -> list[dict]:
        f = filters or {}
        clauses, params = [], []
        for col in ("workspace_id", "project_id", "item_type", "status", "assignee_id", "epic_id"):
            if col in f:
                clauses.append(f"{col}=?")
                params.append(f[col])
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = db.fetchall(
            f"SELECT * FROM board_items {where} ORDER BY status, priority DESC LIMIT ? OFFSET ?",
            (*params, limit, offset),
        )
        return [dict(r) for r in rows]

    def search(self, query: str, filters: dict[str, Any] | None = None) -> list[dict]:
        rows = db.fetchall(
            "SELECT * FROM board_items WHERE title LIKE ? LIMIT 50",
            (f"%{query}%",),
        )
        return [dict(r) for r in rows]

    def for_project(self, project_id: str, **kwargs: Any) -> list[dict]:
        return self.list({"project_id": project_id})

    def for_workspace(self, workspace_id: str, **kwargs: Any) -> list[dict]:
        return self.list({"workspace_id": workspace_id})

    def blocked_items(self, workspace_id: str) -> list[dict]:
        rows = db.fetchall(
            "SELECT * FROM board_items WHERE workspace_id=? AND status='blocked' ORDER BY updated_at DESC",
            (workspace_id,),
        )
        return [dict(r) for r in rows]

    def review_queue(self, workspace_id: str) -> list[dict]:
        rows = db.fetchall(
            "SELECT * FROM review_queue_projection WHERE workspace_id=? ORDER BY updated_at DESC",
            (workspace_id,),
        )
        return [dict(r) for r in rows]

    def merge_queue(self, workspace_id: str) -> list[dict]:
        rows = db.fetchall(
            "SELECT * FROM merge_queue_projection WHERE workspace_id=? ORDER BY queued_at ASC",
            (workspace_id,),
        )
        return [dict(r) for r in rows]
