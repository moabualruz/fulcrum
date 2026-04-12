"""Plane adapter — local→Plane sync. Spec §22."""
from __future__ import annotations
import json
import hashlib
from datetime import datetime, timezone
from typing import Any, Optional
import httpx
from ..db import connection as db
from ..events.store import emit
from ..models.events import EventType
from ..policy.secret_guard import guard_sync_payload

# Object types allowed to sync to Plane (spec §22.9)
SYNCABLE_TYPES = {
    "project", "epic", "issue", "task_summary", "cycle", "milestone",
    "status", "priority", "blocked_reason", "comment_summary",
    "artifact_link", "planning_analytics",
}

# Object types NEVER synced to Plane (spec §22.10)
BLOCKED_SYNC_TYPES = {
    "memory", "event_stream", "agent_chat", "provider_internals",
    "worker_transcript", "secret_artifact", "security_internal",
}


class PlaneAdapter:
    """
    Maps and syncs local objects to Plane. Spec §22.

    Hard rules:
    - Local system remains authoritative (spec §22.2)
    - Local wins on conflict (spec §22.4)
    - Summaries/links only, not raw content (spec §22.5)
    - No secret sync (spec §21.6)
    - No raw memory, event streams, agent chatter (spec §22.10)
    """

    def __init__(self, base_url: str, api_key: str, workspace_id: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.workspace_id = workspace_id
        self._client = httpx.Client(
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=30.0,
        )

    def sync_issue(self, issue_id: str) -> dict:
        """Sync a local issue to Plane."""
        row = db.fetchone("SELECT * FROM issues WHERE id=?", (issue_id,))
        if not row:
            return {"success": False, "error": "Issue not found"}

        if not self._is_syncable("issue", issue_id):
            return {"success": False, "error": "Sync type not allowed"}

        payload = {
            "name": row["title"],
            "description": row["description"] or "",
            "state": self._map_status(row["status"]),
            "priority": self._map_priority(row["priority"]),
        }

        # Guard secrets (spec §21.6, §22.10)
        payload, redacted = guard_sync_payload(payload)

        sync_state = self._get_sync_state("issue", issue_id)
        local_hash = self._hash_payload(payload)

        # Skip if unchanged (idempotent sync)
        if sync_state and sync_state["last_sync_hash"] == local_hash:
            return {"success": True, "unchanged": True}

        # Check for conflict: local wins (spec §22.4)
        if sync_state and sync_state.get("conflict_state") == "remote_modified":
            self._log_conflict_resolution(issue_id, "local_wins")

        external_id = sync_state.get("external_id") if sync_state else None

        try:
            if external_id:
                resp = self._client.patch(
                    f"{self.base_url}/api/v1/issues/{external_id}/",
                    json=payload,
                )
            else:
                resp = self._client.post(
                    f"{self.base_url}/api/v1/issues/",
                    json=payload,
                )
            resp.raise_for_status()
            result_data = resp.json()
            new_external_id = result_data.get("id", external_id)

            self._update_sync_state(
                object_type="issue",
                object_id=issue_id,
                external_id=str(new_external_id),
                status="synced",
                local_hash=local_hash,
            )
            return {"success": True, "external_id": new_external_id}

        except httpx.HTTPStatusError as e:
            self._update_sync_state("issue", issue_id, status="failed",
                                    error=str(e), local_hash=local_hash)
            return {"success": False, "error": str(e)}
        except httpx.RequestError as e:
            self._update_sync_state("issue", issue_id, status="failed",
                                    error=str(e), local_hash=local_hash)
            return {"success": False, "error": str(e)}

    def _is_syncable(self, object_type: str, object_id: str) -> bool:
        """Check if this type is allowed to sync."""
        if object_type in BLOCKED_SYNC_TYPES:
            return False
        return object_type in SYNCABLE_TYPES

    def _map_status(self, local_status: str) -> str:
        """Map local issue status to Plane state name."""
        mapping = {
            "backlog": "Backlog",
            "ready": "Todo",
            "in_progress": "In Progress",
            "blocked": "Blocked",
            "in_review": "In Review",
            "done": "Done",
            "cancelled": "Cancelled",
        }
        return mapping.get(local_status, "Backlog")

    def _map_priority(self, local_priority: str) -> str:
        """Map local priority to Plane priority."""
        mapping = {
            "critical": "urgent",
            "high": "high",
            "medium": "medium",
            "low": "low",
            "none": "none",
        }
        return mapping.get(local_priority, "medium")

    def _hash_payload(self, payload: dict) -> str:
        return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:16]

    def _get_sync_state(self, object_type: str, object_id: str) -> Optional[dict]:
        row = db.fetchone(
            "SELECT * FROM sync_states WHERE object_id=? AND sync_target='plane'",
            (object_id,),
        )
        return dict(row) if row else None

    def _update_sync_state(
        self,
        object_type: str,
        object_id: str,
        external_id: Optional[str] = None,
        status: str = "synced",
        local_hash: Optional[str] = None,
        error: Optional[str] = None,
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        existing = self._get_sync_state(object_type, object_id)
        if existing:
            db.execute(
                """UPDATE sync_states SET sync_status=?, last_synced_at=?, external_id=?,
                   last_sync_hash=?, last_sync_error=?, updated_at=? WHERE object_id=? AND sync_target='plane'""",
                (status, now, external_id or existing.get("external_id"),
                 local_hash, error, now, object_id),
            )
        else:
            from ..ids import generate_id
            sync_id = generate_id("evt_")  # reuse evt_ for internal sync IDs
            db.execute(
                """INSERT INTO sync_states
                   (id, object_type, object_id, workspace_id, sync_target, external_id,
                    sync_status, last_synced_at, last_sync_hash, last_sync_error,
                    direction, created_at, updated_at)
                   VALUES (?, ?, ?, ?, 'plane', ?, ?, ?, ?, ?, 'local_to_remote', ?, ?)""",
                (sync_id, object_type, object_id, self.workspace_id,
                 external_id, status, now, local_hash, error, now, now),
            )
        # Update projection
        db.execute(
            """INSERT OR REPLACE INTO sync_projection
               (object_id, workspace_id, object_type, sync_target, external_id, sync_status, last_synced_at, updated_at)
               VALUES (?, ?, ?, 'plane', ?, ?, ?, ?)""",
            (object_id, self.workspace_id, object_type, external_id, status, now, now),
        )

    def _log_conflict_resolution(self, object_id: str, resolution: str) -> None:
        sync_state = self._get_sync_state("issue", object_id)
        if sync_state:
            now = datetime.now(timezone.utc).isoformat()
            db.execute(
                """INSERT INTO sync_conflicts
                   (id, sync_state_id, local_hash, remote_hash, detected_at, resolved_at, resolution)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    f"conflict_{object_id[:8]}_{now[:10]}",
                    sync_state["id"],
                    sync_state.get("last_sync_hash", ""),
                    "remote_unknown",
                    now, now, resolution,
                ),
            )
