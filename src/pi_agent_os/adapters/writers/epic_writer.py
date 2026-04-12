"""EpicWriter + EpicReadAdapter."""
from __future__ import annotations
import json
from datetime import datetime, timezone
from typing import Any, Optional
from ...models.epic import Epic
from ...db import connection as db
from ...events.store import emit
from ...models.events import EventType
from ..base import WriteAdapter, ReadAdapter


class EpicWriter(WriteAdapter[Epic]):
    def create(self, obj: Epic) -> Epic:
        now = datetime.now(timezone.utc).isoformat()
        db.execute(
            """INSERT INTO epics (id, workspace_id, project_id, display_id, title, description,
               status, priority, milestone_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                obj.epic_id, obj.workspace_id, obj.project_id,
                obj.display_id, obj.title, obj.description,
                obj.status, obj.priority, obj.milestone_id,
                now, now,
            ),
        )
        _upsert_board_item(obj)
        emit(
            EventType.epic_created,
            workspace_id=obj.workspace_id,
            actor_type="system",
            actor_id="epic_writer",
            object_type="epic",
            object_id=obj.epic_id,
            project_id=obj.project_id,
            payload={"title": obj.title, "status": obj.status},
        )
        return obj

    def update(self, id: str, updates: dict[str, Any]) -> Optional[Epic]:
        allowed = {"title", "description", "status", "priority", "milestone_id"}
        fields = {k: v for k, v in updates.items() if k in allowed}
        if not fields:
            return EpicReadAdapter().get(id)
        fields["updated_at"] = datetime.now(timezone.utc).isoformat()
        set_clause = ", ".join(f"{k}=?" for k in fields)
        db.execute(f"UPDATE epics SET {set_clause} WHERE id=?", (*fields.values(), id))
        epic = EpicReadAdapter().get(id)
        if epic:
            _upsert_board_item(epic)
        return epic


class EpicReadAdapter(ReadAdapter[Epic]):
    def get(self, id: str) -> Optional[Epic]:
        row = db.fetchone("SELECT * FROM epics WHERE id=?", (id,))
        return _row_to_epic(row) if row else None

    def list(self, filters: dict[str, Any] | None = None, limit: int = 100, offset: int = 0) -> list[Epic]:
        f = filters or {}
        clauses, params = [], []
        for col in ("workspace_id", "project_id", "status", "priority"):
            if col in f:
                clauses.append(f"{col}=?")
                params.append(f[col])
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = db.fetchall(
            f"SELECT * FROM epics {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (*params, limit, offset),
        )
        return [_row_to_epic(r) for r in rows]

    def search(self, query: str, filters: dict[str, Any] | None = None) -> list[Epic]:
        rows = db.fetchall(
            "SELECT * FROM epics WHERE title LIKE ? OR description LIKE ? LIMIT 50",
            (f"%{query}%", f"%{query}%"),
        )
        return [_row_to_epic(r) for r in rows]

    def for_project(self, project_id: str, **kwargs: Any) -> list[Epic]:
        return self.list({"project_id": project_id})

    def for_workspace(self, workspace_id: str, **kwargs: Any) -> list[Epic]:
        return self.list({"workspace_id": workspace_id})


def _upsert_board_item(epic: Epic) -> None:
    """Upsert a board_items projection row for this epic."""
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        """INSERT OR REPLACE INTO board_items
           (id, workspace_id, project_id, item_type, display_id, title, status, priority,
            assignee_id, epic_id, labels, estimate, updated_at)
           VALUES (?, ?, ?, 'epic', ?, ?, ?, ?, NULL, NULL, ?, NULL, ?)""",
        (
            epic.epic_id, epic.workspace_id, epic.project_id,
            epic.display_id, epic.title, epic.status, epic.priority,
            json.dumps([]), now,
        ),
    )


def _row_to_epic(row: Any) -> Epic:
    return Epic(
        epic_id=row["id"],
        workspace_id=row["workspace_id"],
        project_id=row["project_id"],
        display_id=row["display_id"],
        title=row["title"],
        description=row["description"] or "",
        status=row["status"],
        priority=row["priority"],
        milestone_id=row["milestone_id"],
    )
