"""WorkspaceWriter — write adapter for Workspace objects."""
from __future__ import annotations
import json
from datetime import datetime, timezone
from typing import Any, Optional
from ...models.workspace import Workspace
from ...db import connection as db
from ...events.store import emit
from ...models.events import EventType
from ..base import WriteAdapter


class WorkspaceWriter(WriteAdapter[Workspace]):
    """Creates and updates Workspace records in SQLite."""

    def create(self, obj: Workspace) -> Workspace:
        now = datetime.now(timezone.utc).isoformat()
        db.execute(
            """INSERT INTO workspaces (id, name, description, config_path, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (obj.workspace_id, obj.name, obj.description, obj.config_path, obj.status, now, now),
        )
        emit(
            EventType.project_registered,  # closest event for workspace creation
            workspace_id=obj.workspace_id,
            actor_type="system",
            actor_id="workspace_writer",
            object_type="workspace",
            object_id=obj.workspace_id,
            payload={"name": obj.name},
        )
        return obj

    def update(self, id: str, updates: dict[str, Any]) -> Optional[Workspace]:
        allowed = {"name", "description", "config_path", "status"}
        fields = {k: v for k, v in updates.items() if k in allowed}
        if not fields:
            return self._get(id)
        fields["updated_at"] = datetime.now(timezone.utc).isoformat()
        set_clause = ", ".join(f"{k}=?" for k in fields)
        db.execute(
            f"UPDATE workspaces SET {set_clause} WHERE id=?",
            (*fields.values(), id),
        )
        return self._get(id)

    def _get(self, id: str) -> Optional[Workspace]:
        row = db.fetchone("SELECT * FROM workspaces WHERE id=?", (id,))
        if row is None:
            return None
        return Workspace(
            workspace_id=row["id"],
            name=row["name"],
            description=row["description"] or "",
            config_path=row["config_path"] or "",
            status=row["status"],
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )
