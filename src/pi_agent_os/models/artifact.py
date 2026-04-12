"""
models/artifact.py — Artifact and ArtifactContract models.
"""
from __future__ import annotations

from enum import Enum
from typing import Literal, Optional

from pydantic import Field

from .base import AgentOSBase


class ArtifactType(str, Enum):
    prd = "prd"
    plan = "plan"
    issue_breakdown = "issue_breakdown"
    context_gathering_report = "context_gathering_report"
    patch = "patch"
    changed_files_manifest = "changed_files_manifest"
    command_log = "command_log"
    test_report = "test_report"
    benchmark_report = "benchmark_report"
    review_report = "review_report"
    integration_report = "integration_report"
    merge_conflict_report = "merge_conflict_report"
    risk_report = "risk_report"
    research_note = "research_note"
    source_digest = "source_digest"
    comparison_matrix = "comparison_matrix"
    memory_promotion_summary = "memory_promotion_summary"
    task_outcome_summary = "task_outcome_summary"


class Artifact(AgentOSBase):
    """A file artifact produced or consumed by an agent run."""

    artifact_id: str  # art_ prefix
    workspace_id: str
    project_id: str
    display_id: str  # e.g. ART-99
    artifact_type: ArtifactType
    title: str
    # Canonical path; filename encodes owning object ID per spec §6.3
    file_path: str
    owner_type: str
    owner_id: str
    status: Literal["draft", "final", "archived"] = "draft"
    content_hash: Optional[str] = None


class ArtifactContract(AgentOSBase):
    """Specifies which artifacts a task or workflow must produce."""

    contract_id: str  # ac_ prefix
    task_id: Optional[str] = None
    workflow_id: Optional[str] = None
    required_artifacts: list[ArtifactType] = Field(default_factory=list)
    optional_artifacts: list[ArtifactType] = Field(default_factory=list)
    final_summary_artifact: Optional[ArtifactType] = None
    review_inputs: list[ArtifactType] = Field(default_factory=list)
    merge_readiness_rules: list[str] = Field(default_factory=list)
