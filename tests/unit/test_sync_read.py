"""Tests for SyncStateReadAdapter and SyncConflictReadAdapter."""
from __future__ import annotations
import pytest
from pi_agent_os.db.connection import init_db
from pi_agent_os.agent_home import configure_agent_home, init_agent_home
from pi_agent_os.ids import generate_id, WS_PREFIX
from pi_agent_os.adapters.readers.sync_read import SyncStateReadAdapter, SyncConflictReadAdapter
from pi_agent_os.sync.sync_manager import SyncManager
import pi_agent_os.db.connection as _dbc


@pytest.fixture
def env(tmp_path):
    if hasattr(_dbc._local, "conn") and _dbc._local.conn is not None:
        try:
            _dbc._local.conn.close()
        except Exception:
            pass
        _dbc._local.conn = None
    configure_agent_home(tmp_path / "agent-home")
    init_agent_home(tmp_path / "agent-home")
    init_db(tmp_path / "state.db")
    ws_id = generate_id(WS_PREFIX)
    _dbc.execute(
        "INSERT INTO workspaces (id, name, description, config_path, status, created_at, updated_at) "
        "VALUES (?, 'Test WS', '', '', 'active', '2026-01-01', '2026-01-01')",
        (ws_id,),
    )
    return ws_id


def test_sync_state_empty(env):
    ws_id = env
    reader = SyncStateReadAdapter()
    assert reader.for_workspace(ws_id) == []
    assert reader.pending(ws_id) == []


def test_drift_summary_empty(env):
    ws_id = env
    summary = SyncStateReadAdapter().drift_summary(ws_id)
    assert summary["total"] == 0
    assert summary["pending_queue"] == 0
    assert "by_status" in summary


def test_queue_for_sync_shows_in_pending(env):
    ws_id = env
    manager = SyncManager()
    manager.queue_for_sync("issue", "iss_test_001", ws_id)
    manager.queue_for_sync("issue", "iss_test_002", ws_id)

    pending = SyncStateReadAdapter().pending(ws_id)
    assert len(pending) == 2
    object_ids = [p["object_id"] for p in pending]
    assert "iss_test_001" in object_ids
    assert "iss_test_002" in object_ids

    # Drift summary reflects pending queue
    summary = SyncStateReadAdapter().drift_summary(ws_id)
    assert summary["pending_queue"] == 2


def test_conflict_reader_empty(env):
    ws_id = env
    reader = SyncConflictReadAdapter()
    assert reader.for_workspace(ws_id) == []
    assert reader.unresolved_count(ws_id) == 0


def test_sync_state_get_nonexistent(env):
    env  # initialise DB
    result = SyncStateReadAdapter().get("does_not_exist")
    assert result is None


def test_sync_state_list_filters(env):
    ws_id = env
    manager = SyncManager()
    manager.queue_for_sync("issue", "iss_001", ws_id)
    manager.queue_for_sync("epic", "epic_001", ws_id)

    # Filter by nothing — both visible in pending
    pending = SyncStateReadAdapter().pending(ws_id)
    types = {p["object_type"] for p in pending}
    assert "issue" in types
    assert "epic" in types
