"""
models/plan.py — Plan model.
"""
from __future__ import annotations

from typing import Literal, Optional

from .base import AgentOSBase


class Plan(AgentOSBase):
    """An execution plan, typically derived from a PRD."""

    plan_id: str  # plan_ prefix
    workspace_id: str
    project_id: str
    display_id: str  # e.g. PLAN-9
    title: str
    description: str = ""
    status: Literal["draft", "active", "completed", "archived"] = "draft"
    prd_id: Optional[str] = None
    file_path: str
