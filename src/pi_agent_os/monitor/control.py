"""
PI Agent OS Control API.

Write/control endpoints mounted alongside the read-only monitor.
Called by the TypeScript cockpit extension via fetch().

All routes are under /api/v1/control/.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/control", tags=["control"])


# ── Request models ────────────────────────────────────────────────────────────

class StartRunRequest(BaseModel):
    task_id: str
    agent_role: str
    workspace_id: str
    project_id: str = ""
    worktree_path: str = ""
    pi_run_id: str = ""


class HeartbeatRequest(BaseModel):
    workspace_id: str
    current_step: str = ""
    progress_pct: float = 0.0


class CompleteRunRequest(BaseModel):
    workspace_id: str
    output_summary: str = ""
    artifact_paths: str = ""


class BlockRunRequest(BaseModel):
    workspace_id: str
    reason: str


class CreateTaskRequest(BaseModel):
    title: str
    project_id: str
    workspace_id: str
    description: str = ""
    priority: str = "medium"
    assigned_to: str = ""
    done_criteria: str = ""


class UpdateTaskRequest(BaseModel):
    status: str = ""
    note: str = ""
    assigned_to: str = ""


class RecallMemoryRequest(BaseModel):
    query: str
    workspace_id: str
    project_id: str = ""
    limit: int = 10


class WriteMemoryRequest(BaseModel):
    content: str
    workspace_id: str
    project_id: str
    title: str = "agent memory"
    tags: str = ""


class BuildCosContextRequest(BaseModel):
    goal: str
    project_id: str
    workspace_id: str
    max_tasks: int = 40
    max_events: int = 30


class PolicyCheckRequest(BaseModel):
    action: str
    resource: str
    actor_id: str = "pi"
    workspace_id: str = ""
    actor_type: str = "agent"
    extra: dict = {}


# ── Workspaces ────────────────────────────────────────────────────────────────

@router.get("/workspaces")
def list_workspaces():
    """List all workspaces (for cockpit config discovery)."""
    from ..db import connection as db
    rows = db.fetchall("SELECT id as workspace_id, name, status, created_at FROM workspaces ORDER BY created_at DESC LIMIT 50")
    return {"workspaces": [dict(r) for r in rows]}


@router.get("/projects")
def list_projects(workspace_id: str = ""):
    """List projects, optionally scoped to a workspace."""
    from ..db import connection as db
    if workspace_id:
        rows = db.fetchall(
            "SELECT id as project_id, workspace_id, name, project_type, status FROM projects WHERE workspace_id=? ORDER BY created_at DESC LIMIT 100",
            (workspace_id,),
        )
    else:
        rows = db.fetchall("SELECT id as project_id, workspace_id, name, project_type, status FROM projects ORDER BY created_at DESC LIMIT 100")
    return {"projects": [dict(r) for r in rows]}


# ── Tasks ─────────────────────────────────────────────────────────────────────

@router.get("/tasks")
def list_tasks(workspace_id: str, project_id: str = "", status: str = "", limit: int = 40):
    """List tasks with optional filters."""
    from ..db import connection as db
    clauses = ["workspace_id=?"]
    params: list = [workspace_id]
    if project_id:
        clauses.append("project_id=?")
        params.append(project_id)
    if status:
        clauses.append("status=?")
        params.append(status)
    where = " AND ".join(clauses)
    rows = db.fetchall(
        f"SELECT * FROM tasks WHERE {where} ORDER BY updated_at DESC LIMIT ?",
        (*params, limit),
    )
    return {"tasks": [dict(r) for r in rows]}


@router.post("/tasks")
def create_task(req: CreateTaskRequest):
    """Create a new task."""
    from ..mcp.server import create_task as _create_task
    return _create_task(
        title=req.title,
        project_id=req.project_id,
        workspace_id=req.workspace_id,
        description=req.description,
        priority=req.priority,
        assigned_to=req.assigned_to,
        done_criteria=req.done_criteria,
    )


@router.patch("/tasks/{task_id}")
def update_task(task_id: str, req: UpdateTaskRequest):
    """Update a task's status, note, or assignment."""
    from ..mcp.server import update_task as _update_task
    return _update_task(
        task_id=task_id,
        status=req.status,
        note=req.note,
        assigned_to=req.assigned_to,
    )


# ── Agent run lifecycle ───────────────────────────────────────────────────────

@router.post("/runs")
def start_run(req: StartRunRequest):
    """Register a new agent run."""
    from ..mcp.server import start_agent_run
    return start_agent_run(
        task_id=req.task_id,
        agent_role=req.agent_role,
        workspace_id=req.workspace_id,
        project_id=req.project_id,
        worktree_path=req.worktree_path,
        pi_run_id=req.pi_run_id,
    )


@router.post("/runs/{run_id}/heartbeat")
def heartbeat_run(run_id: str, req: HeartbeatRequest):
    """Send a heartbeat for a running agent."""
    from ..mcp.server import heartbeat_agent_run
    return heartbeat_agent_run(
        run_id=run_id,
        workspace_id=req.workspace_id,
        current_step=req.current_step,
        progress_pct=req.progress_pct,
    )


@router.post("/runs/{run_id}/complete")
def complete_run(run_id: str, req: CompleteRunRequest):
    """Mark a run as completed."""
    from ..mcp.server import complete_agent_run
    return complete_agent_run(
        run_id=run_id,
        workspace_id=req.workspace_id,
        output_summary=req.output_summary,
        artifact_paths=req.artifact_paths,
    )


@router.post("/runs/{run_id}/block")
def block_run(run_id: str, req: BlockRunRequest):
    """Mark a run as blocked."""
    from ..mcp.server import block_agent_run
    return block_agent_run(
        run_id=run_id,
        workspace_id=req.workspace_id,
        reason=req.reason,
    )


# ── Memory ────────────────────────────────────────────────────────────────────

@router.post("/memory/recall")
def recall_memory(req: RecallMemoryRequest):
    """Recall memories by semantic query."""
    from ..mcp.server import recall_memory as _recall
    return {"memories": _recall(
        query=req.query,
        workspace_id=req.workspace_id,
        project_id=req.project_id,
        limit=req.limit,
    )}


@router.post("/memory/write")
def write_memory(req: WriteMemoryRequest):
    """Write a memory note."""
    from ..mcp.server import write_memory as _write
    return _write(
        content=req.content,
        workspace_id=req.workspace_id,
        project_id=req.project_id,
        title=req.title,
        tags=req.tags,
    )


# ── CoS context ───────────────────────────────────────────────────────────────

@router.post("/cos-context")
def build_cos_context(req: BuildCosContextRequest):
    """Build world-state snapshot for Chief of Staff injection."""
    from ..mcp.server import build_cos_context as _build
    return _build(
        goal=req.goal,
        project_id=req.project_id,
        workspace_id=req.workspace_id,
        max_tasks=req.max_tasks,
        max_events=req.max_events,
    )


# ── Policy ────────────────────────────────────────────────────────────────────

@router.post("/policy/check")
def policy_check(req: PolicyCheckRequest):
    """Run a policy check. Returns {allowed, reason}."""
    try:
        from ..policy.engine import check
        result = check(
            action=req.action,
            resource=req.resource,
            actor_id=req.actor_id,
            workspace_id=req.workspace_id,
            actor_type=req.actor_type,
            extra=req.extra,
        )
        return {"allowed": result.allowed, "reason": result.reason or ""}
    except Exception as exc:
        log.error("policy_check failed: %s", exc)
        return {"allowed": True, "reason": ""}
