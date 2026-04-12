"""
models/issue.py — Issue model with IssueStatus enum.
"""
from __future__ import annotations

from enum import Enum
from typing import Literal, Optional

from pydantic import Field

from .base import AgentOSBase


class IssueStatus(str, Enum):
    backlog = "backlog"
    ready = "ready"
    in_progress = "in_progress"
    blocked = "blocked"
    in_review = "in_review"
    done = "done"
    cancelled = "cancelled"


class Issue(AgentOSBase):
    """A user-facing work item tracked at the issue level."""

    issue_id: str  # iss_ prefix
    workspace_id: str
    project_id: str
    epic_id: Optional[str] = None
    display_id: str  # e.g. ISS-143
    title: str
    description: str = ""
    status: IssueStatus = IssueStatus.backlog
    priority: Literal["critical", "high", "medium", "low", "none"] = "medium"
    assignee_agent_id: Optional[str] = None
    estimate: Optional[float] = None
    labels: list[str] = Field(default_factory=list)
    parent_issue_id: Optional[str] = None  # sub-issue support
