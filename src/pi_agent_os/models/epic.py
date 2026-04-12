"""
models/epic.py — Epic model.
"""
from __future__ import annotations

from typing import Literal, Optional

from .base import AgentOSBase


class Epic(AgentOSBase):
    """An epic groups related issues under a common theme."""

    epic_id: str  # epic_ prefix
    workspace_id: str
    project_id: str
    display_id: str  # e.g. EPIC-12
    title: str
    description: str = ""
    status: Literal["backlog", "in_progress", "done", "cancelled"] = "backlog"
    priority: Literal["critical", "high", "medium", "low", "none"] = "medium"
    milestone_id: Optional[str] = None
