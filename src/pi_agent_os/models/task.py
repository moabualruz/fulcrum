"""
models/task.py — Task model with TaskStatus enum.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal, Optional

from pydantic import Field

from .base import AgentOSBase


class TaskStatus(str, Enum):
    queued = "queued"
    ready = "ready"
    claimed = "claimed"
    running = "running"
    blocked = "blocked"
    failed = "failed"
    completed = "completed"
    cancelled = "cancelled"


class Task(AgentOSBase):
    """An atomic unit of work assigned to an agent."""

    task_id: str  # task_ prefix
    workspace_id: str
    project_id: str
    issue_id: Optional[str] = None
    display_id: str  # e.g. TASK-882
    title: str
    description: str = ""
    status: TaskStatus = TaskStatus.queued
    priority: Literal["critical", "high", "medium", "low", "none"] = "medium"
    assigned_agent_id: Optional[str] = None
    assigned_run_id: Optional[str] = None
    estimate: Optional[float] = None
    done_criteria: Optional[str] = None
    blockers: list[str] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list)

    # Lifecycle timestamps (in addition to base created_at / updated_at)
    claimed_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
