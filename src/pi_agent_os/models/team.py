"""
models/team.py — TeamTemplate, TeamInstance, TeamSlot, TeamPolicy models.
"""
from __future__ import annotations

from enum import Enum
from typing import Literal, Optional

from pydantic import Field

from .base import AgentOSBase


class TeamInstanceStatus(str, Enum):
    created = "created"
    ready = "ready"
    spawning = "spawning"
    running = "running"
    waiting = "waiting"
    blocked = "blocked"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class TeamSlot(AgentOSBase):
    """A slot in a team template — defines a role to be filled."""

    slot_id: str
    role: str
    required: bool = True
    agent_profile: Optional[str] = None
    count_min: int = 1
    count_max: int = 1
    spawn_mode: Literal["auto", "manual"] = "auto"
    allowed_tools: list[str] = Field(default_factory=list)
    write_level: Literal["read_only", "comment", "write", "admin"] = "write"
    team_permissions: list[str] = Field(default_factory=list)
    fallbacks: list[str] = Field(default_factory=list)


class TeamPolicy(AgentOSBase):
    """Governance and resource policy for a team."""

    communication_mode: Literal["broadcast", "direct", "hub_and_spoke"] = "hub_and_spoke"
    memory_policy: str = "shared"
    worktree_policy: Literal["per_slot", "shared", "none"] = "per_slot"
    review_policy: str = "integration_worker_required"
    budget_class: Literal["small", "medium", "large"] = "medium"
    latency_class: Literal["fast", "normal", "slow"] = "normal"
    quality_class: Literal["draft", "standard", "high"] = "standard"


class TeamTemplate(AgentOSBase):
    """A reusable blueprint for spawning a team of agents."""

    template_id: str  # team_ prefix
    name: str
    description: str = ""
    slots: list[TeamSlot] = Field(default_factory=list)
    policy: TeamPolicy = Field(default_factory=TeamPolicy)


class TeamInstance(AgentOSBase):
    """A live instantiation of a TeamTemplate."""

    instance_id: str  # team_ prefix (distinct from template_id value)
    template_id: str
    workspace_id: str
    project_id: Optional[str] = None
    status: TeamInstanceStatus = TeamInstanceStatus.created
    purpose: str
    task_id: Optional[str] = None
    created_by_agent_id: str  # must be an L1 agent
    # slot_id -> resolved agent run id
    resolved_slots: dict[str, str] = Field(default_factory=dict)
