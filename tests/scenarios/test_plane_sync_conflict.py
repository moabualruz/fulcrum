"""Golden scenario: Plane sync drift/conflict handling. Spec §22."""
from __future__ import annotations
import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone

from pi_agent_os.db.connection import init_db
from pi_agent_os.agent_home import configure_agent_home, init_agent_home
from pi_agent_os.ids import generate_id, WS_PREFIX, PROJ_PREFIX, ISS_PREFIX
from pi_agent_os.db import connection as db
from pi_agent_os.models.workspace import Workspace
from pi_agent_os.models.project import Project
from pi_agent_os.models.issue import Issue, IssueStatus
from pi_agent_os.adapters.writers.workspace_writer import WorkspaceWriter
from pi_agent_os.adapters.writers.project_writer import ProjectWriter
from pi_agent_os.adapters.readers.issue_read import IssueWriter
from pi_agent_os.sync.plane_adapter import PlaneAdapter


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


@pytest.fixture
def workspace(env, ws_id):
    ws = Workspace(
        workspace_id=ws_id,
        name="Plane Sync Test Workspace",
        description="",
        config_path="",
        status="active",
    )
    WorkspaceWriter().create(ws)
    return ws


@pytest.fixture
def project(env, ws_id, proj_id):
    proj = Project(
        project_id=proj_id,
        workspace_id=ws_id,
        name="Plane Sync Test Project",
        project_type="non_git",
        root_path="/tmp/plane-test",
        write_mode="sequential",
    )
    ProjectWriter().create(proj)
    return proj


@pytest.fixture
def issue(env, ws_id, proj_id):
    iss_id = generate_id(ISS_PREFIX)
    iss = Issue(
        issue_id=iss_id,
        workspace_id=ws_id,
        project_id=proj_id,
        display_id=f"ISS-{iss_id[-6:]}",
        title="Sync test issue",
        description="This issue will be synced to Plane",
        status=IssueStatus.in_progress,
        priority="high",
    )
    IssueWriter().create(iss)
    return iss


def _mock_plane_response(external_id: str = "plane-issue-123") -> MagicMock:
    """Create a mock HTTP response for Plane API."""
    mock_resp = MagicMock()
    mock_resp.raise_for_status.return_value = None
    mock_resp.json.return_value = {"id": external_id}
    return mock_resp


def test_plane_sync_issue_updates_sync_state(env, workspace, project, issue, ws_id):
    """sync_issue() should update the sync_states and sync_projection tables."""
    adapter = PlaneAdapter(
        base_url="http://plane.test",
        api_key="test-api-key",
        workspace_id=ws_id,
    )

    with patch.object(adapter._client, "post", return_value=_mock_plane_response("plane-999")):
        result = adapter.sync_issue(issue.issue_id)

    assert result["success"] is True
    assert result["external_id"] == "plane-999"

    # sync_states should have a record
    row = db.fetchone(
        "SELECT * FROM sync_states WHERE object_id=? AND sync_target='plane'",
        (issue.issue_id,),
    )
    assert row is not None
    assert row["sync_status"] == "synced"
    assert row["external_id"] == "plane-999"


def test_plane_sync_idempotent_unchanged(env, workspace, project, issue, ws_id):
    """If the hash hasn't changed, sync returns unchanged=True without re-pushing."""
    adapter = PlaneAdapter(
        base_url="http://plane.test",
        api_key="test-api-key",
        workspace_id=ws_id,
    )

    # First sync
    with patch.object(adapter._client, "post", return_value=_mock_plane_response("plane-001")):
        adapter.sync_issue(issue.issue_id)

    # Second sync — should be a no-op
    with patch.object(adapter._client, "post") as mock_post, \
         patch.object(adapter._client, "patch") as mock_patch:
        result = adapter.sync_issue(issue.issue_id)

    assert result.get("unchanged") is True
    mock_post.assert_not_called()
    mock_patch.assert_not_called()


def test_plane_sync_conflict_local_wins(env, workspace, project, issue, ws_id):
    """When conflict_state=remote_modified, local wins (spec §22.4)."""
    adapter = PlaneAdapter(
        base_url="http://plane.test",
        api_key="test-api-key",
        workspace_id=ws_id,
    )

    # First, create a sync state with a stale hash and conflict_state=remote_modified
    now = datetime.now(timezone.utc).isoformat()
    sync_id = f"evt_{issue.issue_id[:8]}"
    db.execute(
        """INSERT INTO sync_states
           (id, object_type, object_id, workspace_id, sync_target, external_id,
            sync_status, last_synced_at, last_sync_hash, last_sync_error,
            direction, created_at, updated_at, conflict_state)
           VALUES (?, 'issue', ?, ?, 'plane', 'plane-conflict-ext', 'synced', ?, 'stale-hash-xyz',
                   NULL, 'local_to_remote', ?, ?, 'remote_modified')""",
        (sync_id, issue.issue_id, ws_id, now, now, now),
    )

    with patch.object(adapter._client, "patch", return_value=_mock_plane_response("plane-conflict-ext")):
        result = adapter.sync_issue(issue.issue_id)

    # Local wins — sync should succeed
    assert result["success"] is True

    # Conflict resolution logged
    conflict_row = db.fetchone(
        "SELECT * FROM sync_conflicts WHERE sync_state_id=?", (sync_id,)
    )
    assert conflict_row is not None
    assert conflict_row["resolution"] == "local_wins"


def test_plane_sync_secret_not_in_payload(env, workspace, project, ws_id, proj_id):
    """Secrets must not be synced to Plane (spec §22.10)."""
    # Create an issue with a secret-like description
    iss_id = generate_id(ISS_PREFIX)
    secret_issue = Issue(
        issue_id=iss_id,
        workspace_id=ws_id,
        project_id=proj_id,
        display_id=f"ISS-{iss_id[-6:]}",
        title="Issue with API key reference",
        description='config: { api_key: "sk-abcdefghijklmnopqrstuvwxyz123456" }',
        status=IssueStatus.backlog,
    )
    IssueWriter().create(secret_issue)

    adapter = PlaneAdapter(
        base_url="http://plane.test",
        api_key="test-api-key",
        workspace_id=ws_id,
    )

    captured_payloads = []

    def capture_post(url, json=None, **kwargs):
        captured_payloads.append(json or {})
        return _mock_plane_response("plane-safe-999")

    with patch.object(adapter._client, "post", side_effect=capture_post):
        adapter.sync_issue(iss_id)

    # The synced payload should NOT contain the raw secret
    for payload in captured_payloads:
        description = payload.get("description", "")
        assert "sk-abcdefghijklmnopqrstuvwxyz123456" not in description


def test_plane_sync_blocked_type_not_synced(env, workspace, project, issue, ws_id):
    """memory and event_stream types are blocked from sync (spec §22.10)."""
    adapter = PlaneAdapter(
        base_url="http://plane.test",
        api_key="test-api-key",
        workspace_id=ws_id,
    )

    assert not adapter._is_syncable("memory", "mem_123")
    assert not adapter._is_syncable("event_stream", "evt_123")
    assert not adapter._is_syncable("worker_transcript", "wt_123")
    assert adapter._is_syncable("issue", issue.issue_id)
