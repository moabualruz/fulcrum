"""MemoryTraceReadAdapter — read memory records and traces."""
from __future__ import annotations
import json
from datetime import datetime
from typing import Any, Optional
from ...db import connection as db
from ..base import ReadAdapter


class MemoryTraceReadAdapter(ReadAdapter[dict]):
    """Read memory records. Never full-text dump by default (spec §10.3)."""

    def get(self, id: str) -> Optional[dict]:
        row = db.fetchone("SELECT * FROM memories WHERE id=?", (id,))
        return _compact_memory(row) if row else None

    def get_full(self, id: str) -> Optional[dict]:
        """Get memory with full canonical_text (path-based read per spec §10.4)."""
        row = db.fetchone("SELECT * FROM memories WHERE id=?", (id,))
        return dict(row) if row else None

    def list(self, filters: dict[str, Any] | None = None, limit: int = 100, offset: int = 0) -> list[dict]:
        f = filters or {}
        clauses, params = [], []
        for col in ("workspace_id", "project_id", "scope", "kind"):
            if col in f:
                clauses.append(f"{col}=?")
                params.append(f[col])
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = db.fetchall(
            f"SELECT * FROM memories {where} ORDER BY importance DESC, updated_at DESC LIMIT ? OFFSET ?",
            (*params, limit, offset),
        )
        return [_compact_memory(r) for r in rows]

    def search(self, query: str, filters: dict[str, Any] | None = None, limit: int = 8) -> list[dict]:
        """Default recall: top 8 compact results via FTS (spec §10.3)."""
        f = filters or {}
        workspace_id = f.get("workspace_id", "%")
        scope = f.get("scope", "%")
        try:
            rows = db.fetchall(
                """SELECT m.* FROM memories m
                   JOIN memories_fts fts ON m.rowid = fts.rowid
                   WHERE memories_fts MATCH ? AND m.workspace_id LIKE ? AND m.scope LIKE ?
                   ORDER BY rank LIMIT ?""",
                (query, workspace_id, scope, limit),
            )
        except Exception:
            # FTS may not find results — fall back to LIKE
            rows = db.fetchall(
                "SELECT * FROM memories WHERE title LIKE ? OR summary LIKE ? LIMIT ?",
                (f"%{query}%", f"%{query}%", limit),
            )
        return [_compact_memory(r) for r in rows]

    def for_project(self, project_id: str, **kwargs: Any) -> list[dict]:
        return self.list({"project_id": project_id})

    def for_workspace(self, workspace_id: str, **kwargs: Any) -> list[dict]:
        return self.list({"workspace_id": workspace_id})

    def for_task(self, task_id: str) -> list[dict]:
        rows = db.fetchall(
            "SELECT m.* FROM memories m JOIN task_memory_links l ON m.id=l.memory_id WHERE l.task_id=?",
            (task_id,),
        )
        return [_compact_memory(r) for r in rows]


def _compact_memory(row: Any) -> dict:
    """Return compact memory per spec §10.3 (no full canonical_text by default)."""
    return {
        "memory_id": row["id"],
        "scope": row["scope"],
        "kind": row["kind"],
        "title": row["title"],
        "summary": row["summary"],
        "file_path": row["file_path"],
        "symbol_path": row["symbol_path"],
        "importance": row["importance"],
        "tags": json.loads(row["tags"] or "[]"),
        "task_id": row["task_id"],
        "created_at": row["created_at"],
    }
