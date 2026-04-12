"""Role vocabulary and PI profile mapping. Spec §15.4, §16."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional


# Canonical role vocabulary per spec §15.4
ROLES = {
    "chief_of_staff": "L1 Chief of Staff / Executive Assistant",
    "context_gatherer": "Context Gatherer",
    "prd_planner": "PRD Planner",
    "implementation_planner": "Implementation Planner",
    "issue_decomposer": "Issue Decomposer",
    "architecture_reviewer": "Architecture Reviewer",
    "research_worker": "Research Worker",
    "implementer_backend": "Backend Implementer",
    "implementer_frontend": "Frontend Implementer",
    "refactor_worker": "Refactor Worker",
    "browser_worker": "Browser Worker",
    "tester": "Tester",
    "reviewer": "Reviewer",
    "security_reviewer": "Security Reviewer",
    "performance_reviewer": "Performance Reviewer",
    "integration_worker": "Integration Worker",
}

# L1 roles — only these may create/invoke teams (spec §4.1, §15.2)
L1_ROLES = {"chief_of_staff"}

# Default capability/permission constraints per role
ROLE_CONSTRAINTS = {
    "chief_of_staff": {
        "can_invoke_teams": True,
        "can_write_code": False,  # spec §4.1 hard prohibition
        "can_edit_project_files": False,
        "can_merge": False,
    },
    "integration_worker": {
        "can_invoke_teams": False,
        "can_write_code": True,
        "can_edit_project_files": True,
        "can_merge": True,  # spec §17.4: integration worker owns merge
    },
}


@dataclass
class PIProfile:
    """A PI-native profile binding. Spec §16.1."""
    profile_id: str
    role: str
    model: Optional[str] = None
    provider: Optional[str] = None
    description: str = ""
    fallbacks: list[str] = field(default_factory=list)


@dataclass
class RoleMapping:
    """Maps a semantic role to PI profiles. Spec §16.3."""
    role: str
    primary_profile: Optional[str] = None   # PI profile ID
    fallback_profiles: list[str] = field(default_factory=list)
    default_model: Optional[str] = None
    default_provider: Optional[str] = None


# Default role → PI profile mapping table
# In real deployment this is loaded from agent-home/config/role_mappings.yaml
DEFAULT_ROLE_MAPPINGS: dict[str, RoleMapping] = {
    role: RoleMapping(role=role) for role in ROLES
}


def is_l1(role: str) -> bool:
    """Return True if role is an L1 agent (may invoke teams)."""
    return role in L1_ROLES


def get_role_description(role: str) -> str:
    return ROLES.get(role, f"Unknown role: {role}")


def can_invoke_team(role: str) -> bool:
    """Spec §15.2: only L1 may create or invoke teams."""
    return is_l1(role)


def load_role_mappings(config_path: Optional[str] = None) -> dict[str, RoleMapping]:
    """Load role→PI profile mappings from config file or use defaults."""
    if config_path:
        try:
            import yaml
            from pathlib import Path
            data = yaml.safe_load(Path(config_path).read_text()) or {}
            return {
                role: RoleMapping(
                    role=role,
                    primary_profile=mapping.get("primary_profile"),
                    fallback_profiles=mapping.get("fallback_profiles", []),
                    default_model=mapping.get("default_model"),
                    default_provider=mapping.get("default_provider"),
                )
                for role, mapping in data.items()
            }
        except Exception:
            pass
    return DEFAULT_ROLE_MAPPINGS.copy()
