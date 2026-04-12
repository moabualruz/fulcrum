"""
models/policy.py — PolicyRule, PolicyMatcher, PolicyEvent models.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import Field

from .base import AgentOSBase


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class PolicyAction(str, Enum):
    allow = "allow"
    deny = "deny"
    audit_only = "audit_only"


class PolicyScope(str, Enum):
    system = "system"
    user = "user"
    workspace = "workspace"
    project = "project"
    team_agent = "team_agent"
    workflow_step = "workflow_step"


class MatcherType(str, Enum):
    tool = "tool"
    command = "command"
    path = "path"
    regex = "regex"
    domain_network = "domain_network"
    agent_team = "agent_team"
    workflow_step = "workflow_step"
    artifact = "artifact"
    secret_content = "secret_content"


class PolicyMatcher(AgentOSBase):
    """A single match rule within a PolicyRule."""

    matcher_type: MatcherType
    pattern: str


class PolicyRule(AgentOSBase):
    """A governance rule evaluated at action time."""

    rule_id: str  # pol_ prefix
    scope: PolicyScope
    scope_id: Optional[str] = None  # workspace_id / project_id / agent_id
    name: str
    description: str = ""
    action: PolicyAction
    matchers: list[PolicyMatcher] = Field(default_factory=list)
    enabled: bool = True
    priority: int = 0  # higher = evaluated first


class PolicyEvent(AgentOSBase):
    """An audit event emitted when a policy is evaluated."""

    event_id: str
    rule_id: Optional[str] = None
    action_taken: PolicyAction
    trigger: str  # what triggered the policy check
    actor_id: str
    actor_type: str
    resource: str
    workspace_id: str
    project_id: Optional[str] = None
    timestamp: datetime = Field(default_factory=_utcnow)
    details: dict = Field(default_factory=dict)
