"""
models/workflow.py — WorkflowRun, WorkflowStepState models.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import Field

from .base import AgentOSBase


class WorkflowRunStatus(str, Enum):
    created = "created"
    ready = "ready"
    running = "running"
    waiting_input = "waiting_input"
    waiting_dependency = "waiting_dependency"
    blocked = "blocked"
    failed = "failed"
    completed = "completed"
    cancelled = "cancelled"


class WorkflowStepStatus(str, Enum):
    pending = "pending"
    ready = "ready"
    running = "running"
    retrying = "retrying"
    waiting_input = "waiting_input"
    waiting_dependency = "waiting_dependency"
    blocked = "blocked"
    failed = "failed"
    completed = "completed"
    skipped = "skipped"


class StepType(str, Enum):
    prompt_user = "prompt_user"
    read_memory = "read_memory"
    search_web = "search_web"
    read_project = "read_project"
    run_skill = "run_skill"
    run_script = "run_script"
    create_issue = "create_issue"
    create_task = "create_task"
    spawn_agent = "spawn_agent"
    invoke_team = "invoke_team"
    wait_for_task = "wait_for_task"
    review_artifact = "review_artifact"
    write_memory = "write_memory"
    write_artifact = "write_artifact"
    validate_schema = "validate_schema"
    gate = "gate"
    complete = "complete"


class WorkflowStepState(AgentOSBase):
    """State of a single step within a workflow run."""

    step_id: str
    step_name: str
    step_type: StepType
    status: WorkflowStepStatus = WorkflowStepStatus.pending
    inputs: dict = Field(default_factory=dict)
    outputs: dict = Field(default_factory=dict)
    retry_count: int = 0
    max_retries: int = 0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    artifact_refs: list[str] = Field(default_factory=list)
    memory_refs: list[str] = Field(default_factory=list)


class WorkflowRun(AgentOSBase):
    """A running instance of a named workflow."""

    run_id: str  # wf_ prefix
    workspace_id: str
    project_id: Optional[str] = None
    workflow_name: str
    workflow_version: str = "1.0"
    status: WorkflowRunStatus = WorkflowRunStatus.created
    task_id: Optional[str] = None
    issue_id: Optional[str] = None
    steps: list[WorkflowStepState] = Field(default_factory=list)
    current_step_id: Optional[str] = None
    handoff_refs: list[str] = Field(default_factory=list)
    artifact_refs: list[str] = Field(default_factory=list)

    # Lifecycle timestamps (in addition to base created_at / updated_at)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
