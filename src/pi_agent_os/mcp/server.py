"""
PI Agent OS MCP Tool Server.

Exposes PI-unique control plane tools under the `pi-os` MCP namespace.
Claude and Gemini tools see these as `mcp__pi-os__create_task` etc.,
avoiding name conflicts with built-in CLI tools.

Run:
    python -m pi_agent_os.mcp.server
    # or via CLI:
    pi serve-mcp
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

log = logging.getLogger(__name__)

# Lazy singletons — initialised on first tool call so the module can be
# imported without a live database (important for tests).
_task_reader = None
_task_writer = None


def _get_task_reader():
    global _task_reader
    if _task_reader is None:
        from ..adapters.readers.task_read import TaskReadAdapter
        _task_reader = TaskReadAdapter()
    return _task_reader


def _get_task_writer():
    global _task_writer
    if _task_writer is None:
        from ..adapters.readers.task_read import TaskWriter
        _task_writer = TaskWriter()
    return _task_writer


# ---------------------------------------------------------------------------
# Build the MCP server
# ---------------------------------------------------------------------------

from mcp.server.fastmcp import FastMCP  # noqa: E402

mcp = FastMCP("pi-os", instructions=(
    "PI Agent OS control plane tools. Use these to manage tasks, recall "
    "project memory, and interact with the PI agent runtime. "
    "Always pass project_id and workspace_id when calling task tools."
))


# ---------------------------------------------------------------------------
# Task tools
# ---------------------------------------------------------------------------

@mcp.tool()
def list_tasks(
    project_id: str,
    workspace_id: str,
    status: str = "",
    limit: int = 40,
) -> list[dict]:
    """List tasks for a project, optionally filtered by status."""
    reader = _get_task_reader()
    filters: dict = {"project_id": project_id, "workspace_id": workspace_id}
    if status:
        filters["status"] = status
    tasks = reader.list(filters, limit=limit)
    return [
        {
            "task_id": t.task_id,
            "title": t.title,
            "description": t.description or "",
            "status": t.status.value if hasattr(t.status, "value") else str(t.status),
            "priority": t.priority or "medium",
            "assigned_to": t.assigned_agent_id or "",
            "blockers": t.blockers or [],
            "done_criteria": t.done_criteria or "",
        }
        for t in tasks
    ]


@mcp.tool()
def create_task(
    title: str,
    project_id: str,
    workspace_id: str,
    description: str = "",
    priority: str = "medium",
    assigned_to: str = "",
    done_criteria: str = "",
) -> dict:
    """Create a new task in the project. Returns the created task."""
    from ..models.task import Task, TaskStatus
    from ..ids import generate_id, TASK_PREFIX

    writer = _get_task_writer()
    task = Task(
        task_id=generate_id(TASK_PREFIX),
        workspace_id=workspace_id,
        project_id=project_id,
        display_id=f"T-{datetime.now(timezone.utc).strftime('%H%M%S')}",
        title=title,
        description=description,
        status=TaskStatus.queued,
        priority=priority,
        assigned_agent_id=assigned_to or None,
        done_criteria=done_criteria or None,
    )
    writer.create(task)
    log.info("mcp__pi-os__create_task: %s %s", task.task_id, title)
    return {
        "task_id": task.task_id,
        "title": task.title,
        "status": task.status.value if hasattr(task.status, "value") else str(task.status),
        "priority": task.priority,
        "assigned_to": task.assigned_agent_id or "",
    }


@mcp.tool()
def update_task(
    task_id: str,
    status: str = "",
    note: str = "",
    assigned_to: str = "",
) -> dict:
    """Update a task's status, note/blocker, or assignment."""
    writer = _get_task_writer()
    updates: dict = {}
    if status:
        updates["status"] = status
    if note:
        updates["blockers"] = [note]
    if assigned_to:
        updates["assigned_agent_id"] = assigned_to
    if updates:
        writer.update(task_id, updates)
        log.info("mcp__pi-os__update_task: %s %s", task_id, updates)
    return {"task_id": task_id, "updated": True, "changes": list(updates.keys())}
