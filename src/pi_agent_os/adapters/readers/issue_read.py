"""IssueReadAdapter and IssueWriter."""
from __future__ import annotations
import json
from datetime import datetime, timezone
from typing import Any, Optional
from ...models.issue import Issue, IssueStatus
from ...db import connection as db
from ...events.store import emit
from ...models.events import EventType
from ..base import ReadAdapter, WriteAdapter


class IssueReadAdapter(ReadAdapter[Issue]):
    def get(self, id: str) -> Optional[Issue]:
        row = db.fetchone("SELECT * FROM issues WHERE id=?", (id,))
        return _row_to_issue(row) if row else None

    def list(self, filters: dict[str, Any] | None = None, limit: int = 100, offset: int = 0) -> list[Issue]:
        f = filters or {}
        clauses, params = [], []
        for col in ("workspace_id", "project_id", "epic_id", "status", "assignee_agent_id"):
            if col in f:
                clauses.append(f"{col}=?")
                params.append(f[col])
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = db.fetchall(
            f"SELECT * FROM issues {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (*params, limit, offset),
        )
        return [_row_to_issue(r) for r in rows]

    def search(self, query: str, filters: dict[str, Any] | None = None) -> list[Issue]:
        f = filters or {}
        workspace_id = f.get("workspace_id", "%")
        rows = db.fetchall(
            """SELECT i.* FROM issues i
               JOIN issues_fts fts ON i.rowid = fts.rowid
               WHERE issues_fts MATCH ? AND i.workspace_id LIKE ?
               ORDER BY rank LIMIT 50""",
            (query, workspace_id),
        )
        return [_row_to_issue(r) for r in rows]

    def for_project(self, project_id: str, **kwargs: Any) -> list[Issue]:
        return self.list({"project_id": project_id})

    def for_workspace(self, workspace_id: str, **kwargs: Any) -> list[Issue]:
        return self.list({"workspace_id": workspace_id})


class IssueWriter(WriteAdapter[Issue]):
    def create(self, obj: Issue) -> Issue:
        now = datetime.now(timezone.utc).isoformat()
        db.execute(
            """INSERT INTO issues (id, workspace_id, project_id, epic_id, display_id, title,
               description, status, priority, assignee_agent_id, estimate, labels, parent_issue_id,
               created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                obj.issue_id, obj.workspace_id, obj.project_id, obj.epic_id,
                obj.display_id, obj.title, obj.description,
                obj.status.value if hasattr(obj.status, 'value') else obj.status,
                obj.priority, obj.assignee_agent_id, obj.estimate,
                json.dumps(obj.labels), obj.parent_issue_id, now, now,
            ),
        )
        # Update FTS
        db.execute(
            "INSERT INTO issues_fts(rowid, title, description) SELECT rowid, title, description FROM issues WHERE id=?",
            (obj.issue_id,),
        )
        # Update board projection
        _upsert_board_item(obj)
        # Emit event
        emit(
            EventType.issue_created,
            workspace_id=obj.workspace_id,
            actor_type="system",
            actor_id="issue_writer",
            object_type="issue",
            object_id=obj.issue_id,
            project_id=obj.project_id,
            payload={"title": obj.title, "status": str(obj.status)},
        )
        return obj

    def update(self, id: str, updates: dict[str, Any]) -> Optional[Issue]:
        allowed = {"title", "description", "status", "priority", "assignee_agent_id", "estimate", "labels", "epic_id"}
        fields: dict[str, Any] = {}
        for k, v in updates.items():
            if k in allowed:
                if k == "labels":
                    fields[k] = json.dumps(v)
                elif k == "status" and hasattr(v, 'value'):
                    fields[k] = v.value
                else:
                    fields[k] = v
        if not fields:
            return IssueReadAdapter().get(id)
        fields["updated_at"] = datetime.now(timezone.utc).isoformat()
        set_clause = ", ".join(f"{k}=?" for k in fields)
        db.execute(f"UPDATE issues SET {set_clause} WHERE id=?", (*fields.values(), id))
        issue = IssueReadAdapter().get(id)
        if issue:
            _upsert_board_item(issue)
            emit(
                EventType.task_status_changed,
                workspace_id=issue.workspace_id,
                actor_type="system",
                actor_id="issue_writer",
                object_type="issue",
                object_id=id,
                project_id=issue.project_id,
                payload={"updates": {k: str(v) for k, v in updates.items()}},
            )
        return issue


def _upsert_board_item(issue: Issue) -> None:
    """Upsert a board_items projection row for this issue."""
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        """INSERT OR REPLACE INTO board_items
           (id, workspace_id, project_id, item_type, display_id, title, status, priority,
            assignee_id, epic_id, labels, estimate, updated_at)
           VALUES (?, ?, ?, 'issue', ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            issue.issue_id, issue.workspace_id, issue.project_id,
            issue.display_id, issue.title,
            issue.status.value if hasattr(issue.status, 'value') else str(issue.status),
            issue.priority, issue.assignee_agent_id, issue.epic_id,
            json.dumps(issue.labels), issue.estimate, now,
        ),
    )


def _row_to_issue(row: Any) -> Issue:
    return Issue(
        issue_id=row["id"],
        workspace_id=row["workspace_id"],
        project_id=row["project_id"],
        epic_id=row["epic_id"],
        display_id=row["display_id"],
        title=row["title"],
        description=row["description"] or "",
        status=IssueStatus(row["status"]),
        priority=row["priority"],
        assignee_agent_id=row["assignee_agent_id"],
        estimate=row["estimate"],
        labels=json.loads(row["labels"] or "[]"),
        parent_issue_id=row["parent_issue_id"],
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )
