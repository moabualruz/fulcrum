"""Tests for the SQLite schema creation and migrations."""
import pytest
import sqlite3
import tempfile
from pathlib import Path
from pi_agent_os.db.connection import configure, init_db, fetchall, fetchone, execute


@pytest.fixture
def temp_db(tmp_path):
    db_path = tmp_path / "test_state.db"
    init_db(db_path)
    yield db_path


def test_all_core_tables_created(temp_db):
    from pi_agent_os.db.connection import fetchall
    rows = fetchall("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    table_names = {r["name"] for r in rows}
    required = {
        "workspaces", "projects", "epics", "issues", "tasks",
        "prds", "plans", "agent_runs", "worktrees", "reviews",
        "artifacts", "team_templates", "team_instances", "handoffs",
        "artifact_contracts", "workflow_runs", "cycles", "milestones",
        "events", "memories", "policy_rules", "policy_events",
        "sync_states", "schema_migrations",
    }
    missing = required - table_names
    assert not missing, f"Missing tables: {missing}"


def test_fts_tables_created(temp_db):
    rows = fetchall("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_fts'")
    fts_names = {r["name"] for r in rows}
    required_fts = {"issues_fts", "tasks_fts", "artifacts_fts", "plans_fts", "prds_fts", "memories_fts"}
    assert required_fts.issubset(fts_names)


def test_migrations_table_has_version(temp_db):
    row = fetchone("SELECT * FROM schema_migrations WHERE version=1")
    assert row is not None
    assert row["name"] == "initial_schema"


def test_insert_and_retrieve_workspace(temp_db):
    from pi_agent_os.ids import generate_id, WS_PREFIX
    ws_id = generate_id(WS_PREFIX)
    execute(
        "INSERT INTO workspaces (id, name, description, config_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (ws_id, "Test WS", "", "", "active", "2026-01-01T00:00:00+00:00", "2026-01-01T00:00:00+00:00"),
    )
    row = fetchone("SELECT * FROM workspaces WHERE id=?", (ws_id,))
    assert row is not None
    assert row["name"] == "Test WS"


def test_wal_mode_enabled(temp_db):
    row = fetchone("PRAGMA journal_mode")
    assert row[0] in ("wal", "WAL")
