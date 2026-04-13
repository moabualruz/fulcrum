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
_memory_facade = None
_pi_runtime_ref = None


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


def _get_memory_facade():
    global _memory_facade
    if _memory_facade is None:
        from ..memory.facade import MemoryFacade
        _memory_facade = MemoryFacade()
    return _memory_facade


def _get_pi_runtime():
    global _pi_runtime_ref
    if _pi_runtime_ref is None:
        from ..worker.pi_adapter import get_pi_runtime
        _pi_runtime_ref = get_pi_runtime()
    return _pi_runtime_ref


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
    try:
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
    except Exception as exc:
        log.error("mcp__pi-os__list_tasks error: %s", exc, exc_info=True)
        return [{"error": str(exc)}]


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
    try:
        from ..models.task import Task, TaskStatus
        from ..ids import generate_id, TASK_PREFIX

        writer = _get_task_writer()
        task = Task(
            task_id=generate_id(TASK_PREFIX),
            workspace_id=workspace_id,
            project_id=project_id,
            display_id=f"T-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}",
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
    except Exception as exc:
        log.error("mcp__pi-os__create_task error: %s", exc, exc_info=True)
        return {"error": str(exc)}


@mcp.tool()
def update_task(
    task_id: str,
    status: str = "",
    note: str = "",
    assigned_to: str = "",
) -> dict:
    """Update a task's status, note/blocker, or assignment."""
    try:
        writer = _get_task_writer()
        updates: dict = {}
        if status:
            updates["status"] = status
        if note:
            existing_blockers: list = []
            try:
                results = _get_task_reader().list({"task_id": task_id}, limit=1)
                if results:
                    existing_blockers = results[0].blockers or []
            except Exception:
                pass
            updates["blockers"] = existing_blockers + [note]
        if assigned_to:
            updates["assigned_agent_id"] = assigned_to
        if not updates:
            return {"task_id": task_id, "updated": False, "changes": []}
        writer.update(task_id, updates)
        log.info("mcp__pi-os__update_task: %s %s", task_id, updates)
        return {"task_id": task_id, "updated": True, "changes": list(updates.keys())}
    except Exception as exc:
        log.error("mcp__pi-os__update_task error: %s", exc, exc_info=True)
        return {"error": str(exc)}


# ---------------------------------------------------------------------------
# Memory tools
# ---------------------------------------------------------------------------

@mcp.tool()
def recall_memory(
    query: str,
    workspace_id: str,
    project_id: str = "",
    limit: int = 10,
) -> list[dict]:
    """Recall relevant memories from the project memory store by semantic query."""
    try:
        facade = _get_memory_facade()
        memories = facade.recall(
            query,
            workspace_id=workspace_id,
            project_id=project_id or None,
            limit=limit,
        )
        results = []
        for m in memories:
            if isinstance(m, dict):
                results.append({
                    "content": str(m.get("summary", m.get("content", m)))[:500],
                    "score": float(m.get("score", 0.0)),
                    "tags": m.get("tags", []),
                })
            else:
                results.append({"content": str(m)[:500], "score": 0.0, "tags": []})
        return results
    except Exception as exc:
        log.error("recall_memory failed: %s", exc, exc_info=True)
        return [{"error": str(exc)}]


@mcp.tool()
def write_memory(
    content: str,
    workspace_id: str,
    project_id: str,
    title: str = "agent memory",
    tags: str = "",
) -> dict:
    """Write a memory note to the project memory store."""
    try:
        facade = _get_memory_facade()
        tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []
        mem_id = facade.write(
            workspace_id=workspace_id,
            title=title,
            summary=content,
            scope="project",
            project_id=project_id,
            tags=tag_list,
        )
        log.info("mcp__pi-os__write_memory: project=%s len=%d", project_id, len(content))
        return {"saved": True, "memory_id": mem_id, "project_id": project_id, "tags": tag_list}
    except Exception as exc:
        log.error("write_memory failed: %s", exc, exc_info=True)
        return {"error": str(exc)}


# ---------------------------------------------------------------------------
# Agent runtime tools
# ---------------------------------------------------------------------------

@mcp.tool()
def list_agent_profiles() -> list[dict]:
    """List available PI agent profiles (roles that can be assigned work)."""
    try:
        return _get_pi_runtime().list_profiles()
    except Exception as exc:
        log.error("list_agent_profiles failed: %s", exc, exc_info=True)
        return [{"error": str(exc)}]


@mcp.tool()
def get_agent_run_status(run_id: str) -> dict:
    """Get the live status of a running PI agent."""
    try:
        return _get_pi_runtime().get_run_status(run_id)
    except Exception as exc:
        log.error("get_agent_run_status failed: %s", exc, exc_info=True)
        return {"error": str(exc)}
