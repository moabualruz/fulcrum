"""SQLite schema migration runner."""
from __future__ import annotations
import sqlite3
from pathlib import Path
from datetime import datetime, timezone

SCHEMA_PATH = Path(__file__).parent / "schema.sql"
CURRENT_VERSION = 2


def get_db_version(conn: sqlite3.Connection) -> int:
    """Return current schema version (0 if migrations table doesn't exist)."""
    try:
        row = conn.execute("SELECT MAX(version) FROM schema_migrations").fetchone()
        return row[0] or 0
    except sqlite3.OperationalError:
        return 0


def apply_migrations(conn: sqlite3.Connection) -> None:
    """Apply all pending migrations to the database."""
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")

    current = get_db_version(conn)

    if current < 1:
        _migration_001_initial_schema(conn)
        conn.execute(
            "INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)",
            (1, "initial_schema", datetime.now(timezone.utc).isoformat()),
        )

    if current < 2:
        _migration_002_graph_tables(conn)
        conn.execute(
            "INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)",
            (2, "graph_tables", datetime.now(timezone.utc).isoformat()),
        )

    conn.commit()


def _migration_001_initial_schema(conn: sqlite3.Connection) -> None:
    """Apply the initial schema."""
    schema_sql = SCHEMA_PATH.read_text()
    conn.executescript(schema_sql)


def _migration_002_graph_tables(conn: sqlite3.Connection) -> None:
    """Add graph entity/edge/episode tables for spec §8.6."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS graph_entities (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            name TEXT NOT NULL,
            entity_type TEXT NOT NULL DEFAULT 'concept',
            properties TEXT NOT NULL DEFAULT '{}',
            first_seen TEXT NOT NULL,
            last_seen TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS graph_edges (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            src_id TEXT NOT NULL REFERENCES graph_entities(id),
            dst_id TEXT NOT NULL REFERENCES graph_entities(id),
            label TEXT NOT NULL,
            valid_from TEXT NOT NULL,
            valid_until TEXT,
            episode_id TEXT,
            properties TEXT NOT NULL DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS graph_episodes (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            name TEXT NOT NULL,
            body TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL DEFAULT 'system',
            reference_time TEXT NOT NULL,
            ingested_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_graph_entities_workspace ON graph_entities(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_graph_edges_src ON graph_edges(src_id);
        CREATE INDEX IF NOT EXISTS idx_graph_edges_dst ON graph_edges(dst_id);
        CREATE INDEX IF NOT EXISTS idx_graph_episodes_workspace ON graph_episodes(workspace_id, reference_time);
    """)
