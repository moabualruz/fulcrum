"""Tests for Qdrant local vector backend. Spec §8.5. B-002."""
import pytest

pytest.importorskip("qdrant_client")

from pi_agent_os.memory.backends.qdrant_backend import QdrantBackend


def test_qdrant_backend_in_memory_available():
    """QdrantBackend with ':memory:' path should be available."""
    backend = QdrantBackend(":memory:")
    assert backend.available is True


def test_qdrant_upsert_and_search():
    """Upserted memory should be retrievable by semantic search."""
    backend = QdrantBackend(":memory:")
    assert backend.available

    ws_id = "ws_test_upsert"
    mem_id = "mem_abc123"

    ok = backend.upsert(
        memory_id=mem_id,
        text="authentication decision JWT stateless tokens",
        payload={
            "object_id": mem_id,
            "object_type": "memory",
            "workspace_id": ws_id,
            "project_id": "proj_test",
            "scope": "project",
            "memory_kind": "decision",
            "path": "",
            "symbol": "",
            "title": "Auth decision",
            "summary": "Use JWT for auth",
        },
    )
    assert ok is True

    results = backend.search("JWT authentication", workspace_id=ws_id)
    assert len(results) >= 1
    assert results[0]["memory_id"] == mem_id
    assert "score" in results[0]
    assert "payload" in results[0]


def test_qdrant_search_respects_workspace_filter():
    """Search in a different workspace should return no results."""
    backend = QdrantBackend(":memory:")
    assert backend.available

    mem_id = "mem_ws_isolation"
    backend.upsert(
        memory_id=mem_id,
        text="database indexing strategy",
        payload={
            "object_id": mem_id,
            "object_type": "memory",
            "workspace_id": "ws_one",
            "project_id": "",
            "scope": "project",
            "memory_kind": "fact",
            "path": "",
            "symbol": "",
            "title": "DB strategy",
            "summary": "Use partial indexes",
        },
    )

    results = backend.search("database indexing", workspace_id="ws_two")
    assert results == []


def test_qdrant_unavailable_returns_false(monkeypatch):
    """Backend with failed import should be unavailable and return False/[]."""
    backend = QdrantBackend(":memory:")
    # Simulate unavailability
    backend.available = False

    assert backend.upsert("mem_x", "some text", {}) is False
    assert backend.search("query", workspace_id="ws_x") == []
