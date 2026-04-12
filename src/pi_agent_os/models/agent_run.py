"""
models/agent_run.py — AgentRun and WorkerResult models.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import Field

from .base import AgentOSBase


class AgentRunStatus(str, Enum):
    created = "created"
    starting = "starting"
    running = "running"
    waiting = "waiting"
    blocked = "blocked"
    failed = "failed"
    finished = "finished"
    aborted = "aborted"


class AgentRun(AgentOSBase):
    """A single agent execution instance tied to a task."""

    run_id: str  # run_ prefix
    workspace_id: str
    project_id: str
    task_id: Optional[str] = None
    display_id: str  # e.g. RUN-123
    agent_id: str
    agent_role: str
    pi_profile: Optional[str] = None
    status: AgentRunStatus = AgentRunStatus.created
    current_step: Optional[str] = None
    current_path: Optional[str] = None
    progress_pct: Optional[float] = None
    heartbeat_at: Optional[datetime] = None
    blocker: Optional[str] = None
    worktree_id: Optional[str] = None

    # Lifecycle timestamps (in addition to base created_at / updated_at)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class WorkerResult(AgentOSBase):
    """The result record produced by an agent run upon completion."""

    run_id: str
    task_id: str
    status: str
    summary: str
    artifacts: list[str] = Field(default_factory=list)  # artifact IDs
    files_changed: list[str] = Field(default_factory=list)
    tests: Optional[dict] = None
    memory_writes: list[str] = Field(default_factory=list)
    merge_readiness: bool = False
    risks: list[str] = Field(default_factory=list)
