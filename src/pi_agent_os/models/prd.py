"""
models/prd.py — Product Requirements Document model.
"""
from __future__ import annotations

from typing import Literal, Optional

from .base import AgentOSBase


class PRD(AgentOSBase):
    """A Product Requirements Document artifact."""

    prd_id: str  # prd_ prefix
    workspace_id: str
    project_id: str
    display_id: str  # e.g. PRD-4
    title: str
    description: str = ""
    status: Literal["draft", "review", "approved", "archived"] = "draft"
    file_path: str  # path to the .md artifact
    linked_epic_id: Optional[str] = None
