"""TaskReadAdapter and TaskWriter."""
from __future__ import annotations
import json
from datetime import datetime, timezone
from typing import Any, Optional
from ...models.task import Task, TaskStatus
from ...db import connection as db
from ...events.store import emit
from ...models.events import EventType
from ..base import ReadAdapter, WriteAdapter


class TaskReadAdapter(ReadAdapter[Task]):
    def get(self, id: str) -> Optional[Task]:
        row = db.fetchone("SELECT * FROM tasks WHERE id=?", (id,))
        return _row_to_task(row) if row else None

    def list(self, filters: dict[str, Any] | None = None, limit: int = 100, offset: int = 0) -> list[Task]:
        f = filters or {}
        clauses, params = [], []
        for col in ("workspace_id", "project_id", "issue_id", "status", "assigned_agent_id"):
            if col in f:
                clauses.append(f"{col}=?")
                params.append(f[col])
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = db.fetchall(
            f"SELECT * FROM tasks {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (*params, limit, offset),
        )
        return [_row_to_task(r) for r in rows]

    def search(self, query: str, filters: dict[str, Any] | None = None) -> list[Task]:
        f = filters or {}
        workspace_id = f.get("workspace_id", "%")
        rows = db.fetchall(
            """SELECT t.* FROM tasks t
               JOIN tasks_fts fts ON t.rowid = fts.rowid
               WHERE tasks_fts MATCH ? AND t.workspace_id LIKE ?
               ORDER BY rank LIMIT 50""",
            (query, workspace_id),
        )
        return [_row_to_task(r) for r in rows]

    def for_project(self, project_id: str, **kwargs: Any) -> list[Task]:
        return self.list({"project_id": project_id})

    def for_workspace(self, workspace_id: str, **kwargs: Any) -> list[Task]:
        return self.list({"workspace_id": workspace_id})


class TaskWriter(WriteAdapter[Task]):
    def create(self, obj: Task) -> Task:
        now = datetime.now(timezone.utc).isoformat()
        db.execute(
            """INSERT INTO tasks (id, workspace_id, project_id, issue_id, display_id, title,
               description, status, priority, assigned_agent_id, assigned_run_id, estimate,
               done_criteria, blockers, labels, claimed_at, completed_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                obj.task_id, obj.workspace_id, obj.project_id, obj.issue_id,
                obj.display_id, obj.title, obj.description,
                obj.status.value if hasattr(obj.status, 'value') else obj.status,
                obj.priority, obj.assigned_agent_id, obj.assigned_run_id,
                obj.estimate, obj.done_criteria,
                json.dumps(obj.blockers), json.dumps(obj.labels),
                obj.claimed_at.isoformat() if obj.claimed_at else None,
                obj.completed_at.isoformat() if obj.completed_at else None,
                now, now,
            ),
        )
        # Update FTS
        db.execute(
            "INSERT INTO tasks_fts(rowid, title, description) SELECT rowid, title, description FROM tasks WHERE id=?",
            (obj.task_id,),
        )
        # Update task_state_projection
        _upsert_task_state_projection(obj)
        # Update board projection
        _upsert_board_item(obj)
        # Emit event
        emit(
            EventType.task_created,
            workspace_id=obj.workspace_id,
            actor_type="system",
            actor_id="task_writer",
            object_type="task",
            object_id=obj.task_id,
            project_id=obj.project_id,
            payload={"title": obj.title, "status": str(obj.status)},
        )
        return obj

    def update(self, id: str, updates: dict[str, Any]) -> Optional[Task]:
        allowed = {
            "title", "description", "status", "priority", "assigned_agent_id",
            "assigned_run_id", "estimate", "done_criteria", "blockers", "labels",
            "claimed_at", "completed_at",
        }
        fields: dict[str, Any] = {}
        prev_status: Optional[str] = None

        # Capture previous status for change detection
        if "status" in updates:
            prev_row = db.fetchone("SELECT status FROM tasks WHERE id=?", (id,))
            if prev_row:
                prev_status = prev_row["status"]

        for k, v in updates.items():
            if k in allowed:
                if k in ("blockers", "labels"):
                    fields[k] = json.dumps(v)
                elif k == "status" and hasattr(v, 'value'):
                    fields[k] = v.value
                elif k in ("claimed_at", "completed_at") and isinstance(v, datetime):
                    fields[k] = v.isoformat()
                else:
                    fields[k] = v

        if not fields:
            return TaskReadAdapter().get(id)

        fields["updated_at"] = datetime.now(timezone.utc).isoformat()
        set_clause = ", ".join(f"{k}=?" for k in fields)
        db.execute(f"UPDATE tasks SET {set_clause} WHERE id=?", (*fields.values(), id))

        task = TaskReadAdapter().get(id)
        if task:
            new_status = task.status.value if hasattr(task.status, 'value') else str(task.status)
            status_changed = prev_status is not None and prev_status != new_status

            if status_changed:
                _upsert_task_state_projection(task)
                emit(
                    EventType.task_status_changed,
                    workspace_id=task.workspace_id,
                    actor_type="system",
                    actor_id="task_writer",
                    object_type="task",
                    object_id=id,
                    project_id=task.project_id,
                    payload={
                        "prev_status": prev_status,
                        "new_status": new_status,
                        "updates": {k: str(v) for k, v in updates.items()},
                    },
                )

            _upsert_board_item(task)

        return task


def _upsert_task_state_projection(task: Task) -> None:
    """Upsert a task_state_projection row for this task."""
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        """INSERT OR REPLACE INTO task_state_projection
           (task_id, workspace_id, project_id, status, run_id, agent_id,
            current_step, blocker, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            task.task_id, task.workspace_id, task.project_id,
            task.status.value if hasattr(task.status, 'value') else str(task.status),
            task.assigned_run_id, task.assigned_agent_id,
            None, None, now,
        ),
    )


def _upsert_board_item(task: Task) -> None:
    """Upsert a board_items projection row for this task."""
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        """INSERT OR REPLACE INTO board_items
           (id, workspace_id, project_id, item_type, display_id, title, status, priority,
            assignee_id, epic_id, labels, estimate, updated_at)
           VALUES (?, ?, ?, 'task', ?, ?, ?, ?, ?, NULL, ?, ?, ?)""",
        (
            task.task_id, task.workspace_id, task.project_id,
            task.display_id, task.title,
            task.status.value if hasattr(task.status, 'value') else str(task.status),
            task.priority, task.assigned_agent_id,
            json.dumps(task.labels), task.estimate, now,
        ),
    )


def _row_to_task(row: Any) -> Task:
    return Task(
        task_id=row["id"],
        workspace_id=row["workspace_id"],
        project_id=row["project_id"],
        issue_id=row["issue_id"],
        display_id=row["display_id"],
        title=row["title"],
        description=row["description"] or "",
        status=TaskStatus(row["status"]),
        priority=row["priority"],
        assigned_agent_id=row["assigned_agent_id"],
        assigned_run_id=row["assigned_run_id"],
        estimate=row["estimate"],
        done_criteria=row["done_criteria"],
        blockers=json.loads(row["blockers"] or "[]"),
        labels=json.loads(row["labels"] or "[]"),
        claimed_at=datetime.fromisoformat(row["claimed_at"]) if row["claimed_at"] else None,
        completed_at=datetime.fromisoformat(row["completed_at"]) if row["completed_at"] else None,
    )
