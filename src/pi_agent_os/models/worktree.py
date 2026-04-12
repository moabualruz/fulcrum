"""
models/worktree.py — Worktree model.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from .base import AgentOSBase


class WorktreeStatus(str, Enum):
    allocated = "allocated"
    dirty = "dirty"
    ready_for_merge = "ready_for_merge"
    merged = "merged"
    discarded = "discarded"


class Worktree(AgentOSBase):
    """A git worktree allocated to an agent run."""

    worktree_id: str  # wt_ prefix
    workspace_id: str
    project_id: str
    status: WorktreeStatus = WorktreeStatus.allocated
    branch_name: str
    path: str
    task_id: Optional[str] = None
    run_id: Optional[str] = None

    # Lifecycle timestamps (in addition to base created_at / updated_at)
    merged_at: Optional[datetime] = None
    discarded_at: Optional[datetime] = None
