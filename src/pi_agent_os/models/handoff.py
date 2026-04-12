"""
models/handoff.py — HandoffPacket model.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import Field

from .base import AgentOSBase


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class HandoffMode(str, Enum):
    brief = "brief"
    contextual = "contextual"
    artifact_first_brief = "artifact_first_brief"
    branched_session = "branched_session"


class HandoffPacket(AgentOSBase):
    """A structured handoff from one agent to another."""

    handoff_id: str  # hof_ prefix
    from_agent_id: str
    to_agent_id: str  # can also be a role name
    task_id: Optional[str] = None
    issue_id: Optional[str] = None
    project_id: str
    workspace_id: str
    goal: str
    task_type: str
    priority: str
    scope: str
    inputs: dict = Field(default_factory=dict)
    constraints: list[str] = Field(default_factory=list)
    done_criteria: list[str] = Field(default_factory=list)
    artifact_contract_id: Optional[str] = None
    handoff_mode: HandoffMode = HandoffMode.artifact_first_brief

    # Override created_at with a non-optional datetime (no updated_at needed)
    created_at: datetime = Field(default_factory=_utcnow)
