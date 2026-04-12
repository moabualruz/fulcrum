"""
models/events.py — Event model with all 30 EventType values from spec §19.10.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Literal, Optional

from pydantic import Field

from .base import AgentOSBase


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class EventType(str, Enum):
    project_registered = "project_registered"
    epic_created = "epic_created"
    issue_created = "issue_created"
    task_created = "task_created"
    task_status_changed = "task_status_changed"
    team_created = "team_created"
    team_invoked = "team_invoked"
    agent_run_created = "agent_run_created"
    agent_run_started = "agent_run_started"
    agent_run_progress = "agent_run_progress"
    agent_run_blocked = "agent_run_blocked"
    agent_run_failed = "agent_run_failed"
    agent_run_finished = "agent_run_finished"
    handoff_created = "handoff_created"
    handoff_consumed = "handoff_consumed"
    artifact_written = "artifact_written"
    artifact_validated = "artifact_validated"
    memory_written = "memory_written"
    memory_recalled = "memory_recalled"
    worktree_allocated = "worktree_allocated"
    merge_queued = "merge_queued"
    merge_started = "merge_started"
    merge_conflicted = "merge_conflicted"
    merge_completed = "merge_completed"
    review_created = "review_created"
    validation_started = "validation_started"
    validation_finished = "validation_finished"
    policy_denied = "policy_denied"
    hook_executed = "hook_executed"
    workflow_step_completed = "workflow_step_completed"


class Event(AgentOSBase):
    """An immutable event record emitted by any part of the system."""

    evt_id: str  # evt_ prefix
    evt_type: EventType
    ts: datetime = Field(default_factory=_utcnow)
    workspace_id: str
    project_id: Optional[str] = None
    object_type: Optional[str] = None
    object_id: Optional[str] = None
    actor_type: str
    actor_id: str
    payload: dict = Field(default_factory=dict)
    severity: Literal["debug", "info", "warn", "error"] = "info"
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    correlation_id: Optional[str] = None
