"""Memory facade — unified memory fabric. Spec §10.1."""
from __future__ import annotations
import json
from datetime import datetime, timezone
from typing import Any, Optional
from ..ids import generate_id, MEM_PREFIX
from ..db import connection as db
from ..events.store import emit
from ..models.events import EventType


class MemoryFacade:
    """
    Unified memory facade with global/project/file scopes.

    Spec §10.1: unified memory fabric, all scopes searchable from anywhere.
    Spec §10.3: default recall = top 8 compact results (no full text).
    Spec §10.4: path-based full reads for detail.
    Spec §9.5: canonical write → event → FTS/vector indexes.
    """

    def write(
        self,
        workspace_id: str,
        title: str,
        summary: str,
        kind: str = "fact",
        scope: str = "project",
        project_id: Optional[str] = None,
        file_path: Optional[str] = None,
        symbol_path: Optional[str] = None,
        canonical_text: Optional[str] = None,
        tags: list[str] | None = None,
        entities: list[str] | None = None,
        importance: float = 0.5,
        task_id: Optional[str] = None,
        issue_id: Optional[str] = None,
        artifact_id: Optional[str] = None,
        provenance_refs: list[str] | None = None,
    ) -> str:
        """Write a memory record. Returns memory_id."""
        mem_id = generate_id(MEM_PREFIX)
        now = datetime.now(timezone.utc).isoformat()

        # 1. Canonical write to SQLite (spec §9.5 step 1)
        db.execute(
            """INSERT INTO memories
               (id, scope, kind, workspace_id, project_id, file_path, symbol_path,
                title, summary, canonical_text, tags, entities, created_at, updated_at,
                importance, freshness, content_hash, task_id, issue_id, artifact_id, provenance_refs)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                mem_id, scope, kind, workspace_id, project_id, file_path, symbol_path,
                title, summary, canonical_text,
                json.dumps(tags or []), json.dumps(entities or []),
                now, now, importance, 1.0,
                None,  # content_hash
                task_id, issue_id, artifact_id,
                json.dumps(provenance_refs or []),
            ),
        )

        # 2. Update FTS index (spec §9.5 step 4)
        try:
            db.execute(
                "INSERT INTO memories_fts(rowid, title, summary, canonical_text) "
                "SELECT rowid, title, summary, canonical_text FROM memories WHERE id=?",
                (mem_id,),
            )
        except Exception:
            pass

        # 3. Emit event (spec §9.5 step 2)
        emit(
            EventType.memory_written,
            workspace_id=workspace_id,
            actor_type="system",
            actor_id="memory_facade",
            object_type="memory",
            object_id=mem_id,
            project_id=project_id,
            payload={"kind": kind, "scope": scope, "title": title},
        )

        return mem_id

    def recall(
        self,
        query: str,
        workspace_id: str,
        project_id: Optional[str] = None,
        scope: Optional[str] = None,
        kind: Optional[str] = None,
        limit: int = 8,
        mode: str = "compact",
    ) -> list[dict]:
        """
        Recall memories. Default: top 8 compact (spec §10.3).

        Modes: compact | total_ranked | total_timeline | total_sourcemap
        """
        # FTS search
        try:
            rows = db.fetchall(
                """SELECT m.* FROM memories m
                   JOIN memories_fts fts ON m.rowid = fts.rowid
                   WHERE memories_fts MATCH ?
                   AND m.workspace_id = ?
                   ORDER BY rank LIMIT ?""",
                (query, workspace_id, limit),
            )
        except Exception:
            # FTS fallback to LIKE
            rows = db.fetchall(
                "SELECT * FROM memories WHERE (title LIKE ? OR summary LIKE ?) AND workspace_id=? LIMIT ?",
                (f"%{query}%", f"%{query}%", workspace_id, limit),
            )

        if mode == "compact":
            return [_compact(r) for r in rows]
        elif mode == "total_ranked":
            return [_full(r) for r in rows]
        elif mode == "total_timeline":
            results = [_full(r) for r in rows]
            return sorted(results, key=lambda x: x.get("event_time") or x["created_at"])
        elif mode == "total_sourcemap":
            return [_sourcemap(r) for r in rows]
        return [_compact(r) for r in rows]

    def open_path(self, memory_id: str) -> Optional[dict]:
        """
        Full path-based read of a memory record (spec §10.4).
        Returns full record including canonical_text.
        """
        row = db.fetchone("SELECT * FROM memories WHERE id=?", (memory_id,))
        return _full(row) if row else None

    def get_for_task(self, task_id: str) -> list[dict]:
        """Get compact memories linked to a task."""
        rows = db.fetchall(
            "SELECT m.* FROM memories m JOIN task_memory_links l ON m.id=l.memory_id WHERE l.task_id=?",
            (task_id,),
        )
        return [_compact(r) for r in rows]


def _compact(row: Any) -> dict:
    """Compact format per spec §10.3."""
    return {
        "memory_id": row["id"],
        "summary": row["summary"],
        "scope": row["scope"],
        "kind": row["kind"],
        "file_path": row["file_path"],
        "symbol_path": row["symbol_path"],
        "importance": row["importance"],
        "why_matched": "fts_rank",
        "score": row["importance"],
    }


def _full(row: Any) -> dict:
    return {
        "memory_id": row["id"],
        "scope": row["scope"],
        "kind": row["kind"],
        "workspace_id": row["workspace_id"],
        "project_id": row["project_id"],
        "file_path": row["file_path"],
        "symbol_path": row["symbol_path"],
        "title": row["title"],
        "summary": row["summary"],
        "canonical_text": row["canonical_text"],
        "tags": json.loads(row["tags"] or "[]"),
        "entities": json.loads(row["entities"] or "[]"),
        "importance": row["importance"],
        "task_id": row["task_id"],
        "created_at": row["created_at"],
        "event_time": row["event_time"] if "event_time" in row.keys() else None,
    }


def _sourcemap(row: Any) -> dict:
    return {
        "memory_id": row["id"],
        "file_path": row["file_path"],
        "symbol_path": row["symbol_path"],
        "title": row["title"],
        "summary": row["summary"],
        "scope": row["scope"],
    }
