"""
models/base.py — Shared base model for all PI Agent OS Pydantic models.
"""
from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AgentOSBase(BaseModel):
    """Base class for all PI Agent OS models.

    Provides:
    - created_at / updated_at with UTC defaults
    - use_enum_values=True so enum fields serialise as their string values
    - from_attributes=True to allow ORM-style construction
    """

    model_config = ConfigDict(
        use_enum_values=True,
        from_attributes=True,
        populate_by_name=True,
    )

    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
