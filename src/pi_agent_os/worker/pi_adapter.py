"""PI Runtime Adapter interface. Spec §3.1, §16.1.

PI is the authoritative execution host. This adapter defines the interface
our system uses to interact with PI-native capabilities.

Currently implemented as a stub (B-001 in BLOCKERS.md).
Swap StubPIRuntimeAdapter for a real implementation when PI SDK is available.
"""
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Optional


@dataclass
class PIAgentConfig:
    """Configuration for spawning a PI-native agent."""
    profile_id: str
    task_packet: dict
    worktree_path: Optional[str] = None
    timeout_seconds: Optional[float] = None
    allowed_tools: list[str] = None
    environment: dict[str, str] = None


@dataclass
class PIRunResult:
    """Result from a PI agent run."""
    run_id: str
    status: str   # "completed"|"failed"|"blocked"
    output: dict
    artifacts: list[dict] = None
    error: Optional[str] = None


class PIRuntimeAdapter(ABC):
    """
    Abstract interface to the PI runtime.

    PI is responsible for:
    - native agent definitions
    - model/provider assignment
    - extension registration
    - skill loading
    - subagent execution
    - team runtime
    """

    @abstractmethod
    def spawn_agent(self, config: PIAgentConfig) -> str:
        """Spawn a PI-native agent. Returns a run_id."""
        ...

    @abstractmethod
    def get_run_status(self, run_id: str) -> dict:
        """Get live status of a PI agent run."""
        ...

    @abstractmethod
    def wait_for_run(self, run_id: str, timeout: float | None = None) -> PIRunResult:
        """Block until a PI agent run completes."""
        ...

    @abstractmethod
    def list_profiles(self) -> list[dict]:
        """List available PI-native profiles."""
        ...

    @abstractmethod
    def get_profile(self, profile_id: str) -> Optional[dict]:
        """Get a PI-native profile by ID."""
        ...

    @abstractmethod
    def invoke_team(self, template_id: str, task_packet: dict) -> str:
        """Invoke a PI-native team. Returns team instance ID. Only L1 may call this."""
        ...


class StubPIRuntimeAdapter(PIRuntimeAdapter):
    """
    Stub implementation for development/testing.

    Simulates PI runtime behavior without requiring PI to be installed.
    All spawned agents are recorded locally but not actually executed by PI.
    """

    def spawn_agent(self, config: PIAgentConfig) -> str:
        from ..ids import generate_id, RUN_PREFIX
        run_id = generate_id(RUN_PREFIX)
        print(f"[PIStub] spawn_agent: profile={config.profile_id} run_id={run_id}")
        return run_id

    def get_run_status(self, run_id: str) -> dict:
        return {
            "run_id": run_id,
            "status": "running",
            "current_step": "stub",
            "progress_pct": 50.0,
        }

    def wait_for_run(self, run_id: str, timeout: float | None = None) -> PIRunResult:
        return PIRunResult(
            run_id=run_id,
            status="completed",
            output={"result": "stub output", "note": "PI runtime not available"},
        )

    def list_profiles(self) -> list[dict]:
        return [
            {"profile_id": f"pi_profile_{role}", "role": role, "stub": True}
            for role in [
                "chief_of_staff", "implementer_backend", "implementer_frontend",
                "tester", "reviewer", "integration_worker", "research_worker",
            ]
        ]

    def get_profile(self, profile_id: str) -> Optional[dict]:
        return {"profile_id": profile_id, "stub": True}

    def invoke_team(self, template_id: str, task_packet: dict) -> str:
        from ..ids import generate_id, TEAM_PREFIX
        instance_id = generate_id(TEAM_PREFIX)
        print(f"[PIStub] invoke_team: template={template_id} instance={instance_id}")
        return instance_id


# Module-level singleton (stub by default; replace with real adapter in production)
_pi_runtime: PIRuntimeAdapter = StubPIRuntimeAdapter()


def get_pi_runtime() -> PIRuntimeAdapter:
    return _pi_runtime


def configure_pi_runtime(adapter: PIRuntimeAdapter) -> None:
    global _pi_runtime
    _pi_runtime = adapter
