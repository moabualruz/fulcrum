"""Project directory walker and ingester for memory indexing. Spec §10."""
from __future__ import annotations
import fnmatch
import os
from pathlib import Path
from typing import Optional

from ..facade import MemoryFacade
from .symbol_extractor import extract_python_symbols

# Directories to skip during traversal
_SKIP_DIRS = frozenset({".git", "__pycache__", "node_modules", ".venv", ".mypy_cache", ".pytest_cache"})


def _load_ignore_patterns(project_path: Path) -> tuple[list[str], list[str]]:
    """Load deny (.gitignore + .piignore) and allow (.piinclude) patterns. §10.10.

    Returns (deny_patterns, allow_patterns). allow_patterns override deny.
    """
    deny: list[str] = []
    allow: list[str] = []
    for fname in (".gitignore", ".piignore"):
        p = project_path / fname
        if p.exists():
            for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
                line = line.strip()
                if line and not line.startswith("#"):
                    deny.append(line)
    piinclude = project_path / ".piinclude"
    if piinclude.exists():
        for line in piinclude.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                allow.append(line)
    return deny, allow


def _is_ignored(rel_path: str, deny_patterns: list[str], allow_patterns: list[str]) -> bool:
    """Return True if rel_path should be skipped based on ignore rules."""
    # Allow patterns take precedence
    for pat in allow_patterns:
        if fnmatch.fnmatch(rel_path, pat) or fnmatch.fnmatch(Path(rel_path).name, pat):
            return False
    for pat in deny_patterns:
        if fnmatch.fnmatch(rel_path, pat) or fnmatch.fnmatch(Path(rel_path).name, pat):
            return True
    return False

# Text file extensions to summarize
_TEXT_EXTENSIONS = frozenset({".md", ".yaml", ".yml", ".txt", ".json", ".toml", ".rst"})


def _is_text_file(path: Path) -> bool:
    """Heuristic: check if a file is likely text."""
    try:
        with path.open("rb") as f:
            chunk = f.read(512)
        # If more than 30% null bytes, probably binary
        if chunk.count(b"\x00") > len(chunk) * 0.30:
            return False
        return True
    except OSError:
        return False


class ProjectIngester:
    """
    Walk a project directory, extract symbols, write memories via MemoryFacade.

    Spec §10: unified memory fabric with file-scoped memories for code indexing.
    """

    def __init__(self, facade: Optional[MemoryFacade] = None):
        self._facade = facade or MemoryFacade()

    def ingest(self, project_path: Path, project_id: str, workspace_id: str) -> int:
        """
        Ingest a directory recursively.

        Respects .gitignore, .piignore, and .piinclude files (§10.10).
        Returns count of memories written.
        """
        project_path = Path(project_path)
        deny_patterns, allow_patterns = _load_ignore_patterns(project_path)
        count = 0

        for dirpath, dirnames, filenames in os.walk(project_path):
            # Prune skipped directories in-place
            dirnames[:] = [d for d in dirnames if d not in _SKIP_DIRS]

            for filename in filenames:
                abs_path = Path(dirpath) / filename
                rel_path = abs_path.relative_to(project_path)
                rel_str = str(rel_path)

                if _is_ignored(rel_str, deny_patterns, allow_patterns):
                    continue

                try:
                    written = self._ingest_file(
                        abs_path=abs_path,
                        rel_path=rel_path,
                        project_id=project_id,
                        workspace_id=workspace_id,
                    )
                    count += written
                except Exception:
                    # Skip files that can't be read or processed
                    pass

        return count

    def _ingest_file(
        self,
        abs_path: Path,
        rel_path: Path,
        project_id: str,
        workspace_id: str,
    ) -> int:
        """Process a single file. Returns count of memories written."""
        suffix = abs_path.suffix.lower()

        if suffix == ".py":
            return self._ingest_python_file(abs_path, rel_path, project_id, workspace_id)
        elif suffix in _TEXT_EXTENSIONS:
            return self._ingest_text_file(abs_path, rel_path, project_id, workspace_id)
        else:
            # For other text files, attempt a generic summary
            if _is_text_file(abs_path):
                return self._ingest_text_file(abs_path, rel_path, project_id, workspace_id)
        return 0

    def _ingest_python_file(
        self,
        abs_path: Path,
        rel_path: Path,
        project_id: str,
        workspace_id: str,
    ) -> int:
        """Extract symbols from a Python file and write one memory per symbol."""
        try:
            source = abs_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return 0

        symbols = extract_python_symbols(source, str(abs_path))

        if not symbols:
            # Write one memory for the file itself even if no symbols
            canonical = f"Python module: {rel_path}\n\n{source[:200]}"
            summary = canonical[:120]
            self._facade.write(
                workspace_id=workspace_id,
                title=str(rel_path),
                summary=summary,
                kind="code",
                scope="file",
                project_id=project_id,
                file_path=str(rel_path),
                canonical_text=canonical,
            )
            return 1

        count = 0
        for sym in symbols:
            name = sym["name"]
            kind = sym["kind"]
            docstring = sym.get("docstring") or ""
            lineno = sym.get("lineno", 0)

            canonical = f"{kind} {name} at {rel_path}:{lineno}"
            if docstring:
                canonical += f"\n\n{docstring}"

            summary = canonical[:120]

            self._facade.write(
                workspace_id=workspace_id,
                title=f"{rel_path}::{name}",
                summary=summary,
                kind="code",
                scope="file",
                project_id=project_id,
                file_path=str(rel_path),
                symbol_path=name,
                canonical_text=canonical,
            )
            count += 1

        return count

    def _ingest_text_file(
        self,
        abs_path: Path,
        rel_path: Path,
        project_id: str,
        workspace_id: str,
    ) -> int:
        """Write a single memory summarizing a text file."""
        try:
            content = abs_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return 0

        first_200 = content[:200]
        canonical = f"File: {rel_path}\n\n{first_200}"
        summary = canonical[:120]

        self._facade.write(
            workspace_id=workspace_id,
            title=str(rel_path),
            summary=summary,
            kind="doc",
            scope="file",
            project_id=project_id,
            file_path=str(rel_path),
            canonical_text=canonical,
        )
        return 1
