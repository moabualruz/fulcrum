"""
models/sync.py — SyncState model.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal, Optional

from .base import AgentOSBase


class SyncStatus(str, Enum):
    never_synced = "never_synced"
    queued = "queued"
    syncing = "syncing"
    synced = "synced"
    conflicted = "conflicted"
    failed = "failed"
    disabled = "disabled"


class SyncState(AgentOSBase):
    """Tracks the sync status of a local object against an external target."""

    sync_id: str
    object_type: str
    object_id: str
    workspace_id: str
    sync_target: str = "plane"
    external_id: Optional[str] = None
    last_synced_at: Optional[datetime] = None
    sync_status: SyncStatus = SyncStatus.never_synced
    last_sync_hash: Optional[str] = None
    last_sync_error: Optional[str] = None
    direction: Literal[
        "local_to_remote", "remote_to_local", "bidirectional"
    ] = "local_to_remote"
    conflict_state: Optional[str] = None
