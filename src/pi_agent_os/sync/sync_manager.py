"""Sync manager — orchestrates Plane sync with mixed triggers. Spec §22.7."""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional
from ..db import connection as db


class SyncManager:
    """
    Manages sync lifecycle and queue processing.

    Trigger modes per spec §22.7: manual, event-driven, batch, scheduled.
    Local always wins on conflict (spec §22.4).
    No silent destructive external overwrite (spec §22.4).
    """

    def __init__(self, plane_base_url: Optional[str] = None, plane_api_key: Optional[str] = None):
        self.plane_base_url = plane_base_url
        self.plane_api_key = plane_api_key

    def queue_for_sync(self, object_type: str, object_id: str, workspace_id: str,
                       operation: str = "upsert", priority: int = 0) -> None:
        """Add an object to the sync queue."""
        from ..ids import generate_id, EVT_PREFIX
        now = datetime.now(timezone.utc).isoformat()
        queue_id = generate_id(EVT_PREFIX)
        db.execute(
            """INSERT OR REPLACE INTO sync_queue
               (id, object_type, object_id, workspace_id, sync_target, operation, priority, queued_at)
               VALUES (?, ?, ?, ?, 'plane', ?, ?, ?)""",
            (queue_id, object_type, object_id, workspace_id, operation, priority, now),
        )

    def get_sync_state(self, object_id: str) -> Optional[dict]:
        row = db.fetchone(
            "SELECT * FROM sync_states WHERE object_id=? AND sync_target='plane'", (object_id,)
        )
        return dict(row) if row else None

    def list_queue(self, workspace_id: str) -> list[dict]:
        rows = db.fetchall(
            "SELECT * FROM sync_queue WHERE workspace_id=? ORDER BY priority DESC, queued_at ASC",
            (workspace_id,),
        )
        return [dict(r) for r in rows]

    def list_conflicts(self, workspace_id: str) -> list[dict]:
        rows = db.fetchall(
            """SELECT sc.*, ss.object_id, ss.object_type FROM sync_conflicts sc
               JOIN sync_states ss ON sc.sync_state_id = ss.id
               WHERE ss.workspace_id=? AND sc.resolved_at IS NULL
               ORDER BY sc.detected_at DESC""",
            (workspace_id,),
        )
        return [dict(r) for r in rows]

    def process_queue(self, workspace_id: str, limit: int = 10) -> list[dict]:
        """
        Process items from the sync queue.

        Returns list of results.
        No-op if Plane not configured (spec §22: Plane is optional).
        """
        if not self.plane_base_url or not self.plane_api_key:
            return [{"skipped": True, "reason": "Plane not configured"}]

        items = db.fetchall(
            "SELECT * FROM sync_queue WHERE workspace_id=? ORDER BY priority DESC LIMIT ?",
            (workspace_id, limit),
        )

        from .plane_adapter import PlaneAdapter
        adapter = PlaneAdapter(self.plane_base_url, self.plane_api_key, workspace_id)

        results = []
        for item in items:
            obj_type = item["object_type"]
            obj_id = item["object_id"]

            try:
                if obj_type == "issue":
                    result = adapter.sync_issue(obj_id)
                else:
                    result = {"skipped": True, "reason": f"No sync handler for {obj_type}"}

                # Remove from queue on success
                if result.get("success") or result.get("unchanged") or result.get("skipped"):
                    db.execute("DELETE FROM sync_queue WHERE id=?", (item["id"],))

                results.append({"object_id": obj_id, **result})
            except Exception as e:
                results.append({"object_id": obj_id, "success": False, "error": str(e)})

        return results
