"""SQLite schema migration runner."""
from __future__ import annotations
import sqlite3
from pathlib import Path
from datetime import datetime, timezone

SCHEMA_PATH = Path(__file__).parent / "schema.sql"
CURRENT_VERSION = 1


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

    conn.commit()


def _migration_001_initial_schema(conn: sqlite3.Connection) -> None:
    """Apply the initial schema."""
    schema_sql = SCHEMA_PATH.read_text()
    conn.executescript(schema_sql)
