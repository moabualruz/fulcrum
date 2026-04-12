"""Abstract base classes for all read and write adapters."""
from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any, Generic, Optional, TypeVar
from datetime import datetime

T = TypeVar("T")
ID = str


class ReadAdapter(ABC, Generic[T]):
    """Base class for all read adapters. Spec §9.3, §9.4."""

    @abstractmethod
    def get(self, id: ID) -> Optional[T]:
        """Get a single object by ID."""
        ...

    @abstractmethod
    def list(self, filters: dict[str, Any] | None = None, limit: int = 100, offset: int = 0) -> list[T]:
        """List objects with optional filters."""
        ...

    @abstractmethod
    def search(self, query: str, filters: dict[str, Any] | None = None) -> list[T]:
        """Full-text or semantic search."""
        ...

    def related(self, id: ID) -> list[T]:
        """Get related objects."""
        return []

    def for_project(self, project_id: str, **kwargs: Any) -> list[T]:
        """Get objects belonging to a project."""
        return self.list({"project_id": project_id}, **kwargs)

    def for_workspace(self, workspace_id: str, **kwargs: Any) -> list[T]:
        """Get objects belonging to a workspace."""
        return self.list({"workspace_id": workspace_id}, **kwargs)

    def current(self) -> Optional[T]:
        """Get the current/active object (where applicable)."""
        return None

    def between(self, start: datetime, end: datetime, **kwargs: Any) -> list[T]:
        """Get objects within a time range (for time-based adapters)."""
        return []

    def tail(self, limit: int = 50, **kwargs: Any) -> list[T]:
        """Get most recent objects (for stream-like adapters)."""
        return []


class WriteAdapter(ABC, Generic[T]):
    """Base class for all write adapters. Spec §9.2."""

    @abstractmethod
    def create(self, obj: T) -> T:
        """Create and persist a new object."""
        ...

    @abstractmethod
    def update(self, id: ID, updates: dict[str, Any]) -> Optional[T]:
        """Update an existing object."""
        ...

    def delete(self, id: ID) -> bool:
        """Delete an object (use sparingly)."""
        return False

    def upsert(self, obj: T) -> T:
        """Create or update an object."""
        raise NotImplementedError

    def _emit_event(self, evt_type: Any, workspace_id: str, actor_id: str, object_id: str, object_type: str, **kwargs: Any) -> None:
        """Emit an event after a write. Override to customize."""
        try:
            from ..events.store import emit
            emit(
                evt_type=evt_type,
                workspace_id=workspace_id,
                actor_type="system",
                actor_id=actor_id,
                object_type=object_type,
                object_id=object_id,
                **kwargs,
            )
        except Exception:
            pass  # Events are best-effort, never block writes
