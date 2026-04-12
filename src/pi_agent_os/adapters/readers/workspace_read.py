"""WorkspaceReadAdapter."""
from __future__ import annotations
from datetime import datetime
from typing import Any, Optional
from ...models.workspace import Workspace
from ...db import connection as db
from ..base import ReadAdapter


class WorkspaceReadAdapter(ReadAdapter[Workspace]):
    def get(self, id: str) -> Optional[Workspace]:
        row = db.fetchone("SELECT * FROM workspaces WHERE id=?", (id,))
        return _row_to_workspace(row) if row else None

    def list(self, filters: dict[str, Any] | None = None, limit: int = 100, offset: int = 0) -> list[Workspace]:
        clauses, params = _build_filters(filters or {})
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = db.fetchall(
            f"SELECT * FROM workspaces {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (*params, limit, offset),
        )
        return [_row_to_workspace(r) for r in rows]

    def search(self, query: str, filters: dict[str, Any] | None = None) -> list[Workspace]:
        rows = db.fetchall(
            "SELECT * FROM workspaces WHERE name LIKE ? OR description LIKE ? ORDER BY name LIMIT 50",
            (f"%{query}%", f"%{query}%"),
        )
        return [_row_to_workspace(r) for r in rows]


def _row_to_workspace(row: Any) -> Workspace:
    return Workspace(
        workspace_id=row["id"],
        name=row["name"],
        description=row["description"] or "",
        config_path=row["config_path"] or "",
        status=row["status"],
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )


def _build_filters(filters: dict) -> tuple[list[str], list]:
    clauses, params = [], []
    for k, v in filters.items():
        if k in {"status"}:
            clauses.append(f"{k}=?")
            params.append(v)
    return clauses, params
