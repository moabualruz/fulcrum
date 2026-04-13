"""Single-worker lifecycle management. Spec §17.1, §17.6, §17.7."""
from __future__ import annotations
import json
from datetime import datetime, timezone
from typing import Optional
from ..ids import generate_id, RUN_PREFIX
from ..models.agent_run import AgentRun, AgentRunStatus, WorkerResult
from ..models.handoff import HandoffPacket
from ..models.task import TaskStatus
from ..adapters.writers.agent_run_writer import AgentRunWriter
from ..adapters.readers.task_read import TaskWriter
from ..routing.router import Router
from ..policy.engine import check as policy_check, PolicyDeniedError
from .pi_adapter import get_pi_runtime, PIAgentConfig
from .cos_context import CoSContextBuilder


class WorkerLifecycle:
    """
    Manages the lifecycle of a single worker agent run.

    Spec §17:
    - Default: single lead plus isolated workers
    - Direct worker messaging only in team mode
    - Non-git: sequential writers
    - Workers receive full task packet
    - Workers produce structured run result
    """

    def __init__(self):
        self._writer = AgentRunWriter()
        self._router = Router()
        self._pi = get_pi_runtime()

    def start(
        self,
        handoff: HandoffPacket,
        agent_role: str,
        workspace_id: str,
        project_id: Optional[str] = None,
        worktree_path: Optional[str] = None,
    ) -> AgentRun:
        """
        Start a worker from a handoff packet.

        1. Route role → PI profile
        2. Policy check (spawn allowed?)
        3. Create AgentRun record
        4. Spawn PI agent
        5. Return run with status=starting
        """
        # Routing
        decision = self._router.resolve(role=agent_role)

        # Policy pre-check
        policy_result = policy_check(
            action="spawn_agent",
            resource=agent_role,
            actor_id=handoff.from_agent_id,
            workspace_id=workspace_id,
            project_id=project_id,
        )
        if not policy_result.allowed:
            raise PolicyDeniedError(f"Policy denied agent spawn: {policy_result.reason}")

        # Create run record
        run = AgentRun(
            run_id=generate_id(RUN_PREFIX),
            workspace_id=workspace_id,
            project_id=project_id,
            task_id=handoff.task_id,
            display_id=f"RUN-{generate_id(RUN_PREFIX)[-6:].upper()}",
            agent_id=decision.resolved_profile or f"agent_{agent_role}",
            agent_role=agent_role,
            pi_profile=decision.resolved_profile,
            status=AgentRunStatus.created,
        )
        self._writer.create(run)

        # Build task packet for PI
        task_packet = {
            "handoff_id": handoff.handoff_id,
            "goal": handoff.goal,
            "task_type": handoff.task_type,
            "inputs": handoff.inputs,
            "constraints": handoff.constraints,
            "done_criteria": handoff.done_criteria,
            "artifact_contract_id": handoff.artifact_contract_id,
            "handoff_mode": str(handoff.handoff_mode),
        }

        # Inject world-state for the Chief of Staff so it stays coherent across
        # stateless invocations.
        resolved_role = decision.resolved_profile or agent_role
        if resolved_role == "chief_of_staff" and project_id:
            builder = CoSContextBuilder(
                project_id=project_id,
                workspace_id=workspace_id,
            )
            world_state = builder.build(handoff.goal)
            task_packet["_instruction"] = (
                f"You are the Chief of Staff for this project.\n\n{world_state}"
            )

        # Spawn via PI runtime adapter
        pi_run_id = self._pi.spawn_agent(PIAgentConfig(
            profile_id=decision.resolved_profile or agent_role,
            task_packet=task_packet,
            worktree_path=worktree_path,
        ))

        # Mark as starting
        self._writer.update(run.run_id, {
            "status": AgentRunStatus.starting,
            "started_at": datetime.now(timezone.utc),
        })

        return run

    def complete(
        self,
        run_id: str,
        result: WorkerResult,
    ) -> None:
        """Record completion of a worker run."""
        self._writer.update(run_id, {
            "status": AgentRunStatus.finished if result.status == "completed" else AgentRunStatus.failed,
            "finished_at": datetime.now(timezone.utc),
            "progress_pct": 100.0 if result.status == "completed" else None,
        })
        # Update linked task if run succeeded
        if result.status == "completed" and result.task_id:
            TaskWriter().update(result.task_id, {"status": TaskStatus.completed.value})

    def block(self, run_id: str, blocker_reason: str) -> None:
        """Mark a run as blocked with a reason."""
        self._writer.update(run_id, {
            "status": AgentRunStatus.blocked,
            "blocker": blocker_reason,
        })

    def heartbeat(
        self,
        run_id: str,
        current_step: Optional[str] = None,
        current_path: Optional[str] = None,
        progress_pct: Optional[float] = None,
    ) -> None:
        """Update live status (no LLM required to read this). Spec §19.8."""
        self._writer.heartbeat(run_id, current_step, current_path, progress_pct)
