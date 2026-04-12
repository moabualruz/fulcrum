"""Tests for the memory indexing pipeline."""
from __future__ import annotations
import pytest
from pathlib import Path

from pi_agent_os.db.connection import init_db
from pi_agent_os.agent_home import configure_agent_home, init_agent_home
from pi_agent_os.ids import generate_id, WS_PREFIX, PROJ_PREFIX
from pi_agent_os.db import connection as db
from pi_agent_os.memory.indexing.symbol_extractor import extract_python_symbols
from pi_agent_os.memory.indexing.walker import ProjectIngester


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


# ── Symbol extractor tests ───────────────────────────────────────────────────

def test_python_symbol_extraction_functions(tmp_path):
    """extract_python_symbols returns function symbols."""
    source = '''
def hello_world():
    """Say hello."""
    return "hello"

def add(a, b):
    """Add two numbers."""
    return a + b
'''
    symbols = extract_python_symbols(source, "test.py")
    names = [s["name"] for s in symbols]
    assert "hello_world" in names
    assert "add" in names

    # Check kind
    func_symbols = [s for s in symbols if s["name"] == "hello_world"]
    assert len(func_symbols) == 1
    assert func_symbols[0]["kind"] == "function"
    assert func_symbols[0]["docstring"] == "Say hello."


def test_python_symbol_extraction_classes(tmp_path):
    """extract_python_symbols returns class and method symbols."""
    source = '''
class MyService:
    """A service class."""

    def process(self, data):
        """Process data."""
        return data

    def reset(self):
        pass
'''
    symbols = extract_python_symbols(source, "service.py")
    names = [s["name"] for s in symbols]

    assert "MyService" in names
    assert "MyService.process" in names
    assert "MyService.reset" in names

    cls_symbol = next(s for s in symbols if s["name"] == "MyService")
    assert cls_symbol["kind"] == "class"
    assert cls_symbol["docstring"] == "A service class."


def test_python_symbol_extraction_mixed(tmp_path):
    """extract_python_symbols handles both functions and classes in one file."""
    source = '''
"""Module docstring."""

class Alpha:
    pass

def beta():
    pass

class Gamma:
    def delta(self):
        pass
'''
    symbols = extract_python_symbols(source, "mixed.py")
    names = [s["name"] for s in symbols]
    assert "Alpha" in names
    assert "beta" in names
    assert "Gamma" in names
    assert "Gamma.delta" in names


def test_python_symbol_extraction_empty_file():
    """Empty source returns empty list."""
    symbols = extract_python_symbols("", "empty.py")
    assert symbols == []


def test_python_symbol_extraction_syntax_error():
    """Syntax errors return empty list gracefully."""
    bad_source = "def broken(\n  this is not python"
    symbols = extract_python_symbols(bad_source, "broken.py")
    assert symbols == []


def test_python_symbol_lineno():
    """Symbol records include correct line numbers."""
    source = "def first():\n    pass\n\n\ndef second():\n    pass\n"
    symbols = extract_python_symbols(source, "lineno.py")
    by_name = {s["name"]: s for s in symbols}
    assert by_name["first"]["lineno"] == 1
    assert by_name["second"]["lineno"] == 5


# ── ProjectIngester tests ────────────────────────────────────────────────────

def test_project_ingestion_writes_memories(env, tmp_path, ws_id, proj_id):
    """ProjectIngester.ingest() writes memory records for project files."""
    project_dir = tmp_path / "my-project"
    project_dir.mkdir()

    # Create a Python file
    py_file = project_dir / "main.py"
    py_file.write_text('''
def greet(name: str) -> str:
    """Greet someone."""
    return f"Hello, {name}"

class Greeter:
    """A greeter class."""

    def say_hello(self):
        """Say hello."""
        pass
''')

    # Create a markdown file
    md_file = project_dir / "README.md"
    md_file.write_text("# My Project\n\nThis is a test project.\n")

    ingester = ProjectIngester()
    count = ingester.ingest(project_dir, proj_id, ws_id)

    assert count > 0

    # Check memories were written
    rows = db.fetchall("SELECT * FROM memories WHERE workspace_id=?", (ws_id,))
    assert len(rows) >= 2  # At least Python symbols + README

    # Check that file_path is set
    for row in rows:
        assert row["file_path"] is not None

    # Should have one memory for README
    md_mems = [r for r in rows if "README" in (r["file_path"] or "")]
    assert len(md_mems) >= 1


def test_project_ingestion_skips_git_dir(env, tmp_path, ws_id, proj_id):
    """ProjectIngester should skip .git directories."""
    project_dir = tmp_path / "git-project"
    project_dir.mkdir()

    # Create a .git-like directory with files
    git_dir = project_dir / ".git"
    git_dir.mkdir()
    (git_dir / "HEAD").write_text("ref: refs/heads/main\n")

    # Create a normal file
    (project_dir / "app.py").write_text("def main():\n    pass\n")

    ingester = ProjectIngester()
    count = ingester.ingest(project_dir, proj_id, ws_id)

    rows = db.fetchall("SELECT * FROM memories WHERE workspace_id=?", (ws_id,))
    # .git files should not be indexed
    for row in rows:
        assert ".git" not in (row["file_path"] or "")


def test_project_ingestion_handles_nested_dirs(env, tmp_path, ws_id, proj_id):
    """ProjectIngester recurses into nested directories."""
    project_dir = tmp_path / "nested-project"
    project_dir.mkdir()

    sub = project_dir / "src" / "utils"
    sub.mkdir(parents=True)

    (sub / "helpers.py").write_text("def helper():\n    pass\n")
    (project_dir / "config.yaml").write_text("version: '1.0'\nname: test\n")

    ingester = ProjectIngester()
    count = ingester.ingest(project_dir, proj_id, ws_id)

    assert count >= 2

    rows = db.fetchall("SELECT * FROM memories WHERE workspace_id=?", (ws_id,))
    paths = [r["file_path"] for r in rows]
    # Should have both the nested file and the yaml
    assert any("helpers.py" in p for p in paths if p)
    assert any("config.yaml" in p for p in paths if p)


def test_project_ingestion_skips_pycache(env, tmp_path, ws_id, proj_id):
    """ProjectIngester should skip __pycache__ directories."""
    project_dir = tmp_path / "cache-project"
    project_dir.mkdir()

    cache = project_dir / "__pycache__"
    cache.mkdir()
    (cache / "module.cpython-311.pyc").write_bytes(b"\x00\x01compiled")
    (project_dir / "module.py").write_text("x = 1\n")

    ingester = ProjectIngester()
    ingester.ingest(project_dir, proj_id, ws_id)

    rows = db.fetchall("SELECT * FROM memories WHERE workspace_id=?", (ws_id,))
    for row in rows:
        assert "__pycache__" not in (row["file_path"] or "")


def test_project_ingestion_returns_count(env, tmp_path, ws_id, proj_id):
    """ingest() returns the number of memories written."""
    project_dir = tmp_path / "count-project"
    project_dir.mkdir()

    (project_dir / "a.md").write_text("# A\n")
    (project_dir / "b.md").write_text("# B\n")
    (project_dir / "c.txt").write_text("plain text\n")

    ingester = ProjectIngester()
    count = ingester.ingest(project_dir, proj_id, ws_id)

    assert count == 3

    rows = db.fetchall("SELECT * FROM memories WHERE workspace_id=?", (ws_id,))
    assert len(rows) == 3
