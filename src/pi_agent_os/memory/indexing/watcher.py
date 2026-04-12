"""Ingestion watch trigger using watchdog. Spec §10.12."""
from __future__ import annotations
import logging
import threading
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)

try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler, FileSystemEvent
    _WATCHDOG_AVAILABLE = True
except ImportError:
    _WATCHDOG_AVAILABLE = False


class _ReindexHandler:
    """Calls ProjectIngester on relevant file changes."""

    def __init__(self, project_path: Path, project_id: str, workspace_id: str):
        self.project_path = project_path
        self.project_id = project_id
        self.workspace_id = workspace_id
        self._debounce: dict[str, threading.Timer] = {}

    def on_modified(self, path: str) -> None:
        self._schedule(path)

    def on_created(self, path: str) -> None:
        self._schedule(path)

    def _schedule(self, path: str, delay: float = 2.0) -> None:
        """Debounce: wait 2 s after last change before re-indexing."""
        if path in self._debounce:
            self._debounce[path].cancel()
        t = threading.Timer(delay, self._reindex_file, args=[path])
        self._debounce[path] = t
        t.start()

    def _reindex_file(self, path: str) -> None:
        from .walker import ProjectIngester
        from ...db.connection import init_db
        from ...agent_home import get_db_path
        try:
            init_db(get_db_path())
            ingester = ProjectIngester()
            abs_path = Path(path)
            rel_path = abs_path.relative_to(self.project_path)
            # Re-ingest only the changed file via a single-file micro-walk
            count = ingester._ingest_file(
                abs_path=abs_path,
                rel_path=rel_path,
                project_id=self.project_id,
                workspace_id=self.workspace_id,
            )
            log.debug("Re-indexed %s → %d memories", rel_path, count)
        except Exception as exc:
            log.warning("Re-index failed for %s: %s", path, exc)


class IndexWatcher:
    """
    Live file-system watcher that triggers incremental re-indexing. Spec §10.12.

    Usage:
        watcher = IndexWatcher(project_path, project_id, workspace_id)
        watcher.start()
        ...
        watcher.stop()
    """

    def __init__(self, project_path: Path, project_id: str, workspace_id: str):
        self.project_path = Path(project_path)
        self.project_id = project_id
        self.workspace_id = workspace_id
        self._observer: Optional[object] = None
        self._handler = _ReindexHandler(project_path, project_id, workspace_id)

    def start(self) -> bool:
        """Start the watcher. Returns False if watchdog is unavailable."""
        if not _WATCHDOG_AVAILABLE:
            log.warning("watchdog not available — live indexing disabled")
            return False

        class _WDHandler(FileSystemEventHandler):
            def __init__(self, handler: _ReindexHandler):
                self._h = handler

            def on_modified(self, event: FileSystemEvent) -> None:
                if not event.is_directory:
                    self._h.on_modified(event.src_path)

            def on_created(self, event: FileSystemEvent) -> None:
                if not event.is_directory:
                    self._h.on_created(event.src_path)

        observer = Observer()
        observer.schedule(_WDHandler(self._handler), str(self.project_path), recursive=True)
        observer.start()
        self._observer = observer
        log.info("IndexWatcher started for %s", self.project_path)
        return True

    def stop(self) -> None:
        if self._observer is not None:
            self._observer.stop()  # type: ignore[attr-defined]
            self._observer.join()  # type: ignore[attr-defined]
            self._observer = None
            log.info("IndexWatcher stopped")

    def catchup_from_git_diff(self, since_ref: str = "HEAD~1") -> int:
        """
        Re-index files changed since a git ref. Spec §10.12 'git diff catch-up'.

        Returns count of memories written.
        """
        import subprocess
        try:
            result = subprocess.run(
                ["git", "diff", "--name-only", since_ref],
                cwd=str(self.project_path),
                capture_output=True,
                text=True,
                timeout=30,
            )
            if result.returncode != 0:
                return 0
            changed_files = [f.strip() for f in result.stdout.splitlines() if f.strip()]
        except Exception:
            return 0

        from .walker import ProjectIngester
        ingester = ProjectIngester()
        count = 0
        for rel_str in changed_files:
            abs_path = self.project_path / rel_str
            if abs_path.exists():
                try:
                    count += ingester._ingest_file(
                        abs_path=abs_path,
                        rel_path=Path(rel_str),
                        project_id=self.project_id,
                        workspace_id=self.workspace_id,
                    )
                except Exception:
                    pass
        return count
