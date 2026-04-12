"""
models/workspace.py — Workspace model.
"""
from __future__ import annotations

from typing import Literal

from .base import AgentOSBase


class Workspace(AgentOSBase):
    """Top-level organisational container."""

    workspace_id: str  # ws_ prefix
    name: str
    description: str = ""
    config_path: str = ""
    status: Literal["active", "archived"] = "active"
