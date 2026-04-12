"""ProjectWriter + ProjectReadAdapter."""
from __future__ import annotations
import json
from datetime import datetime, timezone
from typing import Any, Optional
from ...models.project import Project
from ...db import connection as db
from ...events.store import emit
from ...models.events import EventType
from ..base import WriteAdapter, ReadAdapter


class ProjectWriter(WriteAdapter[Project]):
    def create(self, obj: Project) -> Project:
        now = datetime.now(timezone.utc).isoformat()
        db.execute(
            """INSERT INTO projects (id, workspace_id, name, description, project_type,
               root_path, default_branch, parent_project_id, status, write_mode, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                obj.project_id, obj.workspace_id, obj.name, obj.description,
                obj.project_type, obj.root_path, obj.default_branch,
                obj.parent_project_id, obj.status, obj.write_mode, now, now,
            ),
        )
        emit(
            EventType.project_registered,
            workspace_id=obj.workspace_id,
            actor_type="system",
            actor_id="project_writer",
            object_type="project",
            object_id=obj.project_id,
            project_id=obj.project_id,
            payload={"name": obj.name, "project_type": obj.project_type},
        )
        return obj

    def update(self, id: str, updates: dict[str, Any]) -> Optional[Project]:
        allowed = {"name", "description", "status", "root_path", "default_branch", "write_mode"}
        fields = {k: v for k, v in updates.items() if k in allowed}
        if not fields:
            return ProjectReadAdapter().get(id)
        fields["updated_at"] = datetime.now(timezone.utc).isoformat()
        set_clause = ", ".join(f"{k}=?" for k in fields)
        db.execute(f"UPDATE projects SET {set_clause} WHERE id=?", (*fields.values(), id))
        return ProjectReadAdapter().get(id)


class ProjectReadAdapter(ReadAdapter[Project]):
    def get(self, id: str) -> Optional[Project]:
        row = db.fetchone("SELECT * FROM projects WHERE id=?", (id,))
        return _row_to_project(row) if row else None

    def list(self, filters: dict[str, Any] | None = None, limit: int = 100, offset: int = 0) -> list[Project]:
        f = filters or {}
        clauses, params = [], []
        for col in ("workspace_id", "status", "project_type"):
            if col in f:
                clauses.append(f"{col}=?")
                params.append(f[col])
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = db.fetchall(
            f"SELECT * FROM projects {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (*params, limit, offset),
        )
        return [_row_to_project(r) for r in rows]

    def search(self, query: str, filters: dict[str, Any] | None = None) -> list[Project]:
        rows = db.fetchall(
            "SELECT * FROM projects WHERE name LIKE ? OR description LIKE ? LIMIT 50",
            (f"%{query}%", f"%{query}%"),
        )
        return [_row_to_project(r) for r in rows]

    def for_workspace(self, workspace_id: str, **kwargs: Any) -> list[Project]:
        return self.list({"workspace_id": workspace_id})


def _row_to_project(row: Any) -> Project:
    return Project(
        project_id=row["id"],
        workspace_id=row["workspace_id"],
        name=row["name"],
        description=row["description"] or "",
        project_type=row["project_type"],
        root_path=row["root_path"] or "",
        default_branch=row["default_branch"],
        parent_project_id=row["parent_project_id"],
        status=row["status"],
        write_mode=row["write_mode"],
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )
