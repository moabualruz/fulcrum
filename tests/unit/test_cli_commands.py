"""Tests for CLI commands — project, epic, memory, workflow."""
from __future__ import annotations
import json
import pytest
import tempfile
from pathlib import Path
from typer.testing import CliRunner
from pi_agent_os.cli.main import app
import pi_agent_os.db.connection as _dbc


@pytest.fixture(autouse=True)
def isolated_db(tmp_path, monkeypatch):
    """Give every test its own fresh in-memory DB + agent home."""
    # Reset existing connection
    if hasattr(_dbc._local, "conn") and _dbc._local.conn is not None:
        try:
            _dbc._local.conn.close()
        except Exception:
            pass
        _dbc._local.conn = None

    # Patch agent home so bootstrap() uses tmp_path
    from pi_agent_os.agent_home import configure_agent_home, init_agent_home
    configure_agent_home(tmp_path / "agent-home")
    init_agent_home(tmp_path / "agent-home")

    from pi_agent_os.db.connection import init_db
    init_db(tmp_path / "state.db")

    # Also reset config singleton
    import pi_agent_os.config as _cfg
    _cfg._config = None

    yield tmp_path


runner = CliRunner()


def _ws_id(tmp_path) -> str:
    """Create a workspace and return its ID."""
    result = runner.invoke(app, ["workspace", "create", "Test WS"])
    assert result.exit_code == 0, result.output
    # Extract ID from output
    for token in result.output.split():
        if token.startswith("ws_"):
            return token
    raise AssertionError(f"No ws_ ID in: {result.output}")


def _proj_id(ws_id: str) -> str:
    """Create a project and return its ID."""
    result = runner.invoke(app, [
        "project", "create", "Test Project",
        "--workspace", ws_id,
        "--path", "/tmp/proj",
    ])
    assert result.exit_code == 0, result.output
    for token in result.output.split():
        if token.startswith("proj_"):
            return token
    raise AssertionError(f"No proj_ ID in: {result.output}")


# ── workspace ──────────────────────────────────────────────────────────────

def test_workspace_create_and_list(isolated_db):
    result = runner.invoke(app, ["workspace", "create", "My Workspace", "--desc", "test"])
    assert result.exit_code == 0
    assert "ws_" in result.output

    result2 = runner.invoke(app, ["workspace", "list"])
    assert result2.exit_code == 0
    assert "My Workspace" in result2.output


def test_workspace_get(isolated_db):
    create = runner.invoke(app, ["workspace", "create", "GetMe"])
    ws_id = next(t for t in create.output.split() if t.startswith("ws_"))

    get = runner.invoke(app, ["workspace", "get", ws_id])
    assert get.exit_code == 0
    assert "GetMe" in get.output


# ── project ────────────────────────────────────────────────────────────────

def test_project_create_and_list(isolated_db):
    ws_id = _ws_id(isolated_db)
    result = runner.invoke(app, [
        "project", "create", "My Project",
        "--workspace", ws_id,
        "--type", "git",
        "--path", "/srv/repo",
    ])
    assert result.exit_code == 0, result.output
    assert "proj_" in result.output
    assert "My Project" in result.output

    ls = runner.invoke(app, ["project", "list", "--workspace", ws_id])
    assert ls.exit_code == 0
    assert "My Project" in ls.output


def test_project_get(isolated_db):
    ws_id = _ws_id(isolated_db)
    proj_id = _proj_id(ws_id)

    get = runner.invoke(app, ["project", "get", proj_id])
    assert get.exit_code == 0
    assert "Test Project" in get.output
    assert proj_id in get.output


def test_project_update(isolated_db):
    ws_id = _ws_id(isolated_db)
    proj_id = _proj_id(ws_id)

    upd = runner.invoke(app, ["project", "update", proj_id, "--status", "archived"])
    assert upd.exit_code == 0

    get = runner.invoke(app, ["project", "get", proj_id])
    assert "archived" in get.output


def test_project_not_found(isolated_db):
    _ws_id(isolated_db)  # ensure DB is initialised
    result = runner.invoke(app, ["project", "get", "proj_doesnotexist"])
    assert result.exit_code == 1
    assert "not found" in result.output.lower()


# ── epic ───────────────────────────────────────────────────────────────────

def test_epic_create_and_list(isolated_db):
    ws_id = _ws_id(isolated_db)
    proj_id = _proj_id(ws_id)

    result = runner.invoke(app, [
        "epic", "create", "Auth Epic",
        "--workspace", ws_id,
        "--project", proj_id,
        "--desc", "All auth work",
        "--priority", "high",
    ])
    assert result.exit_code == 0, result.output
    assert "EPIC-1" in result.output

    ls = runner.invoke(app, ["epic", "list", "--workspace", ws_id])
    assert ls.exit_code == 0
    assert "Auth Epic" in ls.output


def test_epic_sequential_numbering(isolated_db):
    ws_id = _ws_id(isolated_db)
    proj_id = _proj_id(ws_id)
    for title in ("Epic A", "Epic B", "Epic C"):
        runner.invoke(app, ["epic", "create", title, "--workspace", ws_id, "--project", proj_id])

    ls = runner.invoke(app, ["epic", "list", "--workspace", ws_id])
    assert "EPIC-1" in ls.output
    assert "EPIC-2" in ls.output
    assert "EPIC-3" in ls.output


def test_epic_update(isolated_db):
    ws_id = _ws_id(isolated_db)
    proj_id = _proj_id(ws_id)
    runner.invoke(app, ["epic", "create", "Draft Epic", "--workspace", ws_id, "--project", proj_id])

    # Get epic ID
    from pi_agent_os.adapters.writers.epic_writer import EpicReadAdapter
    epics = EpicReadAdapter().for_project(proj_id)
    assert epics
    epic_id = epics[0].epic_id

    upd = runner.invoke(app, ["epic", "update", epic_id, "--status", "in_progress"])
    assert upd.exit_code == 0

    get = runner.invoke(app, ["epic", "get", epic_id])
    assert "in_progress" in get.output


# ── memory ─────────────────────────────────────────────────────────────────

def test_memory_write_and_recall(isolated_db):
    ws_id = _ws_id(isolated_db)

    # Write a memory
    write = runner.invoke(app, [
        "memory", "write", "Auth Design",
        "--summary", "We use JWT with RS256 keys",
        "--workspace", ws_id,
        "--kind", "decision",
    ])
    assert write.exit_code == 0, write.output
    assert "mem_" in write.output

    # Recall it — compact mode doesn't include title, but summary is there
    recall = runner.invoke(app, ["memory", "recall", "JWT", "--workspace", ws_id])
    assert recall.exit_code == 0
    assert "result" in recall.output  # found at least 1
    # Total ranked mode includes title
    recall2 = runner.invoke(app, ["memory", "recall", "JWT", "--workspace", ws_id, "--mode", "total_ranked", "--raw"])
    assert recall2.exit_code == 0
    data = json.loads(recall2.output)
    titles = [r.get("title", "") for r in data]
    assert any("Auth Design" in t for t in titles)


def test_memory_recall_no_results(isolated_db):
    ws_id = _ws_id(isolated_db)
    result = runner.invoke(app, ["memory", "recall", "nothing here", "--workspace", ws_id])
    assert result.exit_code == 0
    assert "No memories" in result.output


def test_memory_ingest_file(isolated_db, tmp_path):
    ws_id = _ws_id(isolated_db)
    proj_id = _proj_id(ws_id)

    # Create a temp file
    test_file = tmp_path / "auth.py"
    test_file.write_text("def authenticate(token):\n    return verify_jwt(token)\n")

    result = runner.invoke(app, [
        "memory", "ingest", str(test_file),
        "--workspace", ws_id,
        "--project", proj_id,
    ])
    assert result.exit_code == 0, result.output
    assert "mem_" in result.output


def test_memory_ingest_missing_path(isolated_db):
    ws_id = _ws_id(isolated_db)
    result = runner.invoke(app, [
        "memory", "ingest", "/nonexistent/path",
        "--workspace", ws_id,
    ])
    assert result.exit_code == 1
    assert "not found" in result.output.lower()


# ── workflow ────────────────────────────────────────────────────────────────

def test_workflow_list_empty(isolated_db):
    ws_id = _ws_id(isolated_db)
    result = runner.invoke(app, ["workflow", "list", "--workspace", ws_id])
    assert result.exit_code == 0
    assert "No workflow runs" in result.output


def test_workflow_list_bundled(isolated_db):
    result = runner.invoke(app, ["workflow", "list", "--bundled"])
    assert result.exit_code == 0
    # grill-me is a bundled workflow
    assert "grill-me" in result.output


def test_workflow_run_nonexistent(isolated_db):
    ws_id = _ws_id(isolated_db)
    result = runner.invoke(app, [
        "workflow", "run", "no-such-workflow",
        "--workspace", ws_id,
    ])
    assert result.exit_code == 1
    assert "not found" in result.output.lower()


def test_workflow_get_nonexistent(isolated_db):
    _ws_id(isolated_db)
    result = runner.invoke(app, ["workflow", "get", "wf_doesnotexist"])
    assert result.exit_code == 1
    assert "not found" in result.output.lower()
