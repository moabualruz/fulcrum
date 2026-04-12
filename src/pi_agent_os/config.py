"""Configuration loading for PI Agent OS."""
from __future__ import annotations
import os
from pathlib import Path
from typing import Optional
import yaml
from .agent_home import get_agent_home, get_db_path, init_agent_home
from .db.connection import init_db


class Config:
    """Runtime configuration. Loaded once at startup."""

    def __init__(
        self,
        agent_home: Optional[Path] = None,
        plane_base_url: Optional[str] = None,
        plane_api_key: Optional[str] = None,
        embedding_model: str = "all-MiniLM-L6-v2",
        qdrant_url: Optional[str] = None,
        qdrant_collection: str = "pi_agent_os",
        default_workspace_id: Optional[str] = None,
    ):
        self.agent_home = agent_home
        self.plane_base_url = plane_base_url or os.environ.get("PLANE_BASE_URL")
        self.plane_api_key = plane_api_key or os.environ.get("PLANE_API_KEY")
        self.embedding_model = embedding_model
        self.qdrant_url = qdrant_url or os.environ.get("QDRANT_URL")
        self.qdrant_collection = qdrant_collection
        self.default_workspace_id = default_workspace_id


_config: Optional[Config] = None


def get_config() -> Config:
    global _config
    if _config is None:
        _config = Config()
    return _config


def bootstrap(agent_home: Optional[Path] = None) -> Config:
    """Bootstrap the full runtime: init agent-home, DB, config."""
    global _config
    home = init_agent_home(agent_home)
    db_path = get_db_path()
    init_db(db_path)

    # Try to load config from workspace.yaml
    ws_yaml = home / "workspace.yaml"
    cfg_data = {}
    if ws_yaml.exists():
        try:
            cfg_data = yaml.safe_load(ws_yaml.read_text()) or {}
        except Exception:
            pass

    _config = Config(
        agent_home=home,
        plane_base_url=cfg_data.get("plane_base_url"),
        plane_api_key=cfg_data.get("plane_api_key"),
        embedding_model=cfg_data.get("embedding_model", "all-MiniLM-L6-v2"),
        qdrant_url=cfg_data.get("qdrant_url"),
        default_workspace_id=cfg_data.get("default_workspace_id"),
    )
    return _config
