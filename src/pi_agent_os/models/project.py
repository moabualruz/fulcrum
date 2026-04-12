"""
models/project.py — Project model.
"""
from __future__ import annotations

from typing import Literal, Optional

from .base import AgentOSBase


class Project(AgentOSBase):
    """A project within a workspace."""

    project_id: str  # proj_ prefix
    workspace_id: str
    name: str
    description: str = ""
    project_type: Literal["git", "non_git", "submodule", "logical"]
    root_path: str
    default_branch: Optional[str] = None
    parent_project_id: Optional[str] = None  # for submodules
    status: Literal["active", "archived", "paused"] = "active"
    # sequential = single writer; worktree = parallel writers via git worktrees
    write_mode: Literal["sequential", "worktree"] = "sequential"
