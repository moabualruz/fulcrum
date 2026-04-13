"""Event append-only storage."""
from __future__ import annotations
import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from ..models.events import Event, EventType
from ..ids import generate_id, EVT_PREFIX
from ..db import connection as db

_log_lock = threading.Lock()


def emit(
    evt_type: EventType,
    workspace_id: str,
    actor_type: str,
    actor_id: str,
    payload: dict | None = None,
    project_id: Optional[str] = None,
    object_type: Optional[str] = None,
    object_id: Optional[str] = None,
    severity: str = "info",
    trace_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
) -> Event:
    """Emit and persist an event."""
    evt = Event(
        evt_id=generate_id(EVT_PREFIX),
        evt_type=evt_type,
        ts=datetime.now(timezone.utc),
        workspace_id=workspace_id,
        project_id=project_id,
        object_type=object_type,
        object_id=object_id,
        actor_type=actor_type,
        actor_id=actor_id,
        payload=payload or {},
        severity=severity,
        trace_id=trace_id,
        correlation_id=correlation_id,
    )

    db.execute(
        """INSERT INTO events (
            id, evt_type, ts, workspace_id, project_id, object_type, object_id,
            actor_type, actor_id, payload, severity, trace_id, span_id, correlation_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            evt.evt_id, evt.evt_type.value if hasattr(evt.evt_type, 'value') else evt.evt_type,
            evt.ts.isoformat(),
            evt.workspace_id, evt.project_id,
            evt.object_type, evt.object_id,
            evt.actor_type, evt.actor_id,
            json.dumps(evt.payload),
            evt.severity,
            evt.trace_id, evt.span_id, evt.correlation_id,
        ),
    )

    _append_to_log(evt)
    return evt


def _append_to_log(evt: Event) -> None:
    """Append event to the filesystem append-only log (thread-safe)."""
    from ..agent_home import get_events_dir
    events_dir = get_events_dir()
    if events_dir is None:
        return
    log_file = events_dir / f"{evt.workspace_id}.jsonl"
    line = json.dumps({
        "id": evt.evt_id,
        "type": evt.evt_type.value if hasattr(evt.evt_type, 'value') else str(evt.evt_type),
        "ts": evt.ts.isoformat(),
        "ws": evt.workspace_id,
        "proj": evt.project_id,
        "actor": f"{evt.actor_type}:{evt.actor_id}",
        "payload": evt.payload,
    })
    with _log_lock:
        with open(log_file, "a") as f:
            f.write(line + "\n")


def tail(workspace_id: str, limit: int = 50, project_id: Optional[str] = None) -> list[dict]:
    """Return the most recent events."""
    if project_id:
        rows = db.fetchall(
            "SELECT * FROM events WHERE workspace_id=? AND project_id=? ORDER BY ts DESC LIMIT ?",
            (workspace_id, project_id, limit),
        )
    else:
        rows = db.fetchall(
            "SELECT * FROM events WHERE workspace_id=? ORDER BY ts DESC LIMIT ?",
            (workspace_id, limit),
        )
    return [dict(r) for r in rows]
