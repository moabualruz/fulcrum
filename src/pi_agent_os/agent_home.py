"""Global agent-home directory management."""
from __future__ import annotations
import os
from pathlib import Path
from typing import Optional
import yaml

_AGENT_HOME: Optional[Path] = None

DEFAULT_HOME = Path.home() / ".pi-agent-home"

LAYOUT = [
    "config",
    "teams",
    "agents",
    "skills",
    "workflows",
    "registry",
    "data",
    "events",
    "caches",
    "exports",
    "imports",
]


def get_agent_home() -> Path:
    """Return the configured agent-home path (creating it if needed)."""
    global _AGENT_HOME
    if _AGENT_HOME is None:
        _AGENT_HOME = Path(os.environ.get("PI_AGENT_HOME", str(DEFAULT_HOME)))
    return _AGENT_HOME


def configure_agent_home(path: Path) -> None:
    """Override the agent-home path (call before first use)."""
    global _AGENT_HOME
    _AGENT_HOME = path


def get_db_path() -> Path:
    return get_agent_home() / "state.db"


def get_events_dir() -> Optional[Path]:
    d = get_agent_home() / "events"
    return d if d.exists() else None


def get_artifacts_dir(project_id: str) -> Path:
    base = get_agent_home() / "artifacts" / project_id
    for sub in ["prds", "plans", "reviews", "reports", "patches", "research", "outcomes"]:
        (base / sub).mkdir(parents=True, exist_ok=True)
    return base


def get_config_path() -> Path:
    return get_agent_home() / "config"


def get_teams_dir() -> Path:
    return get_agent_home() / "teams"


def get_workflows_dir() -> Path:
    return get_agent_home() / "workflows"


def get_workspace_config_path() -> Path:
    return get_agent_home() / "workspace.yaml"


def artifact_path(project_id: str, artifact_type: str, owner_id: str, ext: str = "md") -> Path:
    """Generate canonical artifact path per spec §6.3.

    Format: artifacts/<project_id>/<artifact_type>/<owner_id>.<ext>
    Example: artifacts/proj_01ABC/plans/plan_01DEF.md
    """
    base = get_agent_home() / "artifacts" / project_id / artifact_type
    base.mkdir(parents=True, exist_ok=True)
    return base / f"{owner_id}.{ext}"


def init_agent_home(path: Optional[Path] = None) -> Path:
    """Initialize the agent-home directory structure."""
    if path is not None:
        configure_agent_home(path)
    home = get_agent_home()
    home.mkdir(parents=True, exist_ok=True)

    for subdir in LAYOUT:
        (home / subdir).mkdir(exist_ok=True)

    # Initialize workspace.yaml if not present
    ws_config = get_workspace_config_path()
    if not ws_config.exists():
        ws_config.write_text(
            "# PI Agent OS workspace configuration\n"
            "version: '0.1'\n"
            "workspaces: []\n"
        )

    return home
