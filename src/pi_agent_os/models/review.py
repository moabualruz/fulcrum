"""
models/review.py — Review model.
"""
from __future__ import annotations

from enum import Enum
from typing import Literal, Optional

from .base import AgentOSBase


class ReviewStatus(str, Enum):
    pending = "pending"
    changes_requested = "changes_requested"
    approved = "approved"
    rejected = "rejected"


class Review(AgentOSBase):
    """A review of a task output, artifact, or worktree."""

    review_id: str  # rev_ prefix
    workspace_id: str
    project_id: str
    display_id: str  # e.g. REV-5
    status: ReviewStatus = ReviewStatus.pending
    target_type: Literal["task", "artifact", "worktree"]
    target_id: str
    reviewer_agent_id: Optional[str] = None
    summary: Optional[str] = None
    file_path: Optional[str] = None
