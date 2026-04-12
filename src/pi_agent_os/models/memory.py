"""
models/memory.py — Memory record model.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import Field

from .base import AgentOSBase


class MemoryKind(str, Enum):
    fact = "fact"
    summary = "summary"
    symbol = "symbol"
    decision = "decision"
    procedure = "procedure"
    error = "error"
    diff = "diff"
    doc = "doc"
    code = "code"
    task_goal = "task_goal"
    task_decision = "task_decision"
    task_failure = "task_failure"
    task_outcome = "task_outcome"


class MemoryScope(str, Enum):
    global_ = "global"
    project = "project"
    file = "file"


class Memory(AgentOSBase):
    """A memory record stored in the memory plane."""

    memory_id: str  # mem_ prefix
    scope: MemoryScope
    kind: MemoryKind
    workspace_id: str
    project_id: Optional[str] = None
    file_path: Optional[str] = None
    symbol_path: Optional[str] = None
    title: str
    summary: str
    canonical_text: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    entities: list[str] = Field(default_factory=list)

    # Extra timestamps beyond base created_at / updated_at
    event_time: Optional[datetime] = None
    last_seen_at: Optional[datetime] = None

    importance: float = 0.5
    freshness: float = 1.0
    content_hash: Optional[str] = None

    # Cross-references
    task_id: Optional[str] = None
    issue_id: Optional[str] = None
    artifact_id: Optional[str] = None
    provenance_refs: list[str] = Field(default_factory=list)
