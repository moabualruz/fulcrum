"""Tests for the memory facade."""
import pytest
from pi_agent_os.db.connection import init_db
from pi_agent_os.agent_home import configure_agent_home, init_agent_home
from pi_agent_os.ids import generate_id, WS_PREFIX, PROJ_PREFIX
from pi_agent_os.memory.facade import MemoryFacade


@pytest.fixture
def env(tmp_path):
    configure_agent_home(tmp_path / "agent-home")
    init_agent_home(tmp_path / "agent-home")
    init_db(tmp_path / "state.db")
    return tmp_path


@pytest.fixture
def ws_id():
    return generate_id(WS_PREFIX)


@pytest.fixture
def proj_id():
    return generate_id(PROJ_PREFIX)


def test_memory_write_and_recall(env, ws_id, proj_id):
    facade = MemoryFacade()
    mem_id = facade.write(
        workspace_id=ws_id,
        title="Authentication architecture decision",
        summary="Decided to use JWT for stateless auth with 1-hour expiry",
        kind="decision",
        scope="project",
        project_id=proj_id,
        tags=["auth", "jwt", "architecture"],
    )
    assert mem_id.startswith("mem_")

    results = facade.recall("authentication JWT", workspace_id=ws_id)
    assert len(results) >= 1
    assert any(r["memory_id"] == mem_id for r in results)


def test_memory_compact_mode_no_canonical_text(env, ws_id, proj_id):
    """Default recall must not return full canonical text (spec §10.3)."""
    facade = MemoryFacade()
    facade.write(
        workspace_id=ws_id,
        title="Big implementation note",
        summary="Short summary",
        canonical_text="Very long canonical text that should not appear in compact mode" * 10,
        kind="fact",
        scope="project",
        project_id=proj_id,
    )

    results = facade.recall("implementation", workspace_id=ws_id, mode="compact")
    for r in results:
        assert "canonical_text" not in r


def test_memory_open_path_returns_full(env, ws_id, proj_id):
    """Full read via path returns canonical text (spec §10.4)."""
    facade = MemoryFacade()
    canonical = "Full detailed text of the memory record"
    mem_id = facade.write(
        workspace_id=ws_id,
        title="Detail note",
        summary="Summary only",
        canonical_text=canonical,
        kind="doc",
        scope="project",
        project_id=proj_id,
    )

    full = facade.open_path(mem_id)
    assert full is not None
    assert full["canonical_text"] == canonical


def test_memory_scope_isolation(env, ws_id, proj_id):
    """Global scope memories should be retrievable without project filter."""
    facade = MemoryFacade()
    facade.write(
        workspace_id=ws_id,
        title="Global user preference",
        summary="User prefers dark mode",
        kind="fact",
        scope="global",
    )

    # Search without project filter
    results = facade.recall("dark mode preference", workspace_id=ws_id, scope="global")
    assert len(results) >= 1


def test_memory_recall_limit(env, ws_id, proj_id):
    """Default recall returns at most 8 results (spec §10.3)."""
    facade = MemoryFacade()
    for i in range(15):
        facade.write(
            workspace_id=ws_id,
            title=f"Test memory {i}",
            summary=f"Summary of test memory {i}",
            kind="fact",
            scope="project",
            project_id=proj_id,
        )

    results = facade.recall("test memory", workspace_id=ws_id)
    assert len(results) <= 8


def test_memory_write_emits_event(env, ws_id, proj_id):
    """Writing memory should emit a memory_written event."""
    from pi_agent_os.events.store import tail
    facade = MemoryFacade()
    facade.write(
        workspace_id=ws_id,
        title="Event test memory",
        summary="Should emit event",
        kind="fact",
        scope="project",
        project_id=proj_id,
    )

    events = tail(workspace_id=ws_id, limit=10)
    assert any(e["evt_type"] == "memory_written" for e in events)
