"""SQLite connection management."""
from __future__ import annotations
import sqlite3
import threading
from pathlib import Path
from typing import Optional
from contextlib import contextmanager
from .migrations import apply_migrations

_local = threading.local()
_db_path: Optional[Path] = None


def configure(db_path: Path) -> None:
    """Configure the database path. Resets thread-local connection if path changed."""
    global _db_path
    if _db_path != db_path:
        # Path changed — close and drop the stale connection so next use opens fresh
        if hasattr(_local, "conn") and _local.conn is not None:
            try:
                _local.conn.close()
            except Exception:
                pass
            _local.conn = None
    _db_path = db_path


def _get_raw_connection() -> sqlite3.Connection:
    """Get a thread-local raw SQLite connection."""
    if not hasattr(_local, "conn") or _local.conn is None:
        if _db_path is None:
            raise RuntimeError("Database not configured. Call configure(db_path) first.")
        conn = sqlite3.connect(str(_db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA synchronous=NORMAL")
        _local.conn = conn
    return _local.conn


def init_db(db_path: Path) -> None:
    """Initialize the database: configure path and apply migrations."""
    configure(db_path)
    conn = _get_raw_connection()
    apply_migrations(conn)


@contextmanager
def get_connection():
    """Context manager for a database connection."""
    conn = _get_raw_connection()
    try:
        yield conn
    except Exception:
        conn.rollback()
        raise


def execute(sql: str, params: tuple = ()) -> sqlite3.Cursor:
    """Execute a SQL statement and return the cursor."""
    with get_connection() as conn:
        cursor = conn.execute(sql, params)
        conn.commit()
        return cursor


def fetchall(sql: str, params: tuple = ()) -> list[sqlite3.Row]:
    """Execute a query and return all rows."""
    with get_connection() as conn:
        return conn.execute(sql, params).fetchall()


def fetchone(sql: str, params: tuple = ()) -> Optional[sqlite3.Row]:
    """Execute a query and return one row."""
    with get_connection() as conn:
        return conn.execute(sql, params).fetchone()
