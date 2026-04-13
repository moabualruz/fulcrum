"""Thin DAG workflow runner. Spec §13."""
from __future__ import annotations
import json
import time
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional
import yaml

from ...ids import generate_id, WF_PREFIX
from ...models.workflow import (
    WorkflowRun, WorkflowStepState, WorkflowRunStatus, WorkflowStepStatus, StepType,
)
from ...db import connection as db
from ...events.store import emit
from ...models.events import EventType
from .steps import StepExecutor, StepContext, StepResult, HumanInputRequired


class WorkflowRunner:
    """
    Executes a coded workflow definition (workflow.yaml) as a DAG.

    - Supports ordered steps and DAG (steps with `depends_on` fields)
    - Persists all state to SQLite (resumable)
    - Enforces L1-only team invocation
    - Step-level retries and per-step/per-workflow timeouts
    - Blocked != Failed (spec §13.8)
    - Human-input steps pause execution and return control to caller
    """

    def __init__(self, workflow_dir: Path, executor: Optional[StepExecutor] = None):
        self.workflow_dir = workflow_dir
        self.executor = executor or StepExecutor()
        self._definition: dict = {}
        self._load_definition()

    def _load_definition(self) -> None:
        wf_yaml = self.workflow_dir / "workflow.yaml"
        if wf_yaml.exists():
            self._definition = yaml.safe_load(wf_yaml.read_text()) or {}

    def create_run(
        self,
        workspace_id: str,
        project_id: Optional[str] = None,
        task_id: Optional[str] = None,
        issue_id: Optional[str] = None,
        inputs: dict | None = None,
    ) -> WorkflowRun:
        """Create a new WorkflowRun record (does not start execution)."""
        wf_name = self._definition.get("name", self.workflow_dir.name)
        wf_version = self._definition.get("version", "1.0")

        steps_def = self._definition.get("steps", [])
        steps = [
            WorkflowStepState(
                step_id=s.get("id", f"step_{i}"),
                step_name=s.get("name", s.get("id", f"step_{i}")),
                step_type=StepType(s.get("type", "run_skill")),
                status=WorkflowStepStatus.pending,
                inputs=s.get("inputs", {}),
                max_retries=s.get("max_retries", 0),
            )
            for i, s in enumerate(steps_def)
        ]

        run = WorkflowRun(
            run_id=generate_id(WF_PREFIX),
            workspace_id=workspace_id,
            project_id=project_id,
            workflow_name=wf_name,
            workflow_version=wf_version,
            status=WorkflowRunStatus.created,
            task_id=task_id,
            issue_id=issue_id,
            steps=steps,
        )

        _persist_run(run)
        emit(
            EventType.workflow_step_completed,  # using as workflow_created proxy
            workspace_id=workspace_id,
            actor_type="workflow",
            actor_id=run.run_id,
            object_type="workflow_run",
            object_id=run.run_id,
            payload={"workflow_name": wf_name, "event": "created"},
        )
        return run

    def load_run(self, run_id: str) -> Optional[WorkflowRun]:
        """Load a persisted WorkflowRun from the database (for resumability)."""
        try:
            return _reload_run(run_id)
        except RuntimeError:
            return None

    def execute(
        self,
        run: WorkflowRun,
        context: dict | None = None,
        on_human_input: Optional[Callable[[WorkflowStepState], dict]] = None,
    ) -> WorkflowRun:
        """
        Execute a WorkflowRun synchronously.

        - Resumes from current state if run is already in progress
        - Pauses on human_input steps (calls on_human_input callback or raises HumanInputRequired)
        - Returns updated run after completion, failure, or human-input pause
        """
        ctx = context or {}

        # Mark running
        run = _update_run_status(run, WorkflowRunStatus.running)
        emit(
            EventType.workflow_step_completed,
            workspace_id=run.workspace_id,
            actor_type="workflow",
            actor_id=run.run_id,
            object_type="workflow_run",
            object_id=run.run_id,
            payload={"event": "started"},
        )

        # Build execution order from DAG (topological sort)
        steps_def = self._definition.get("steps", [])
        ordered_ids = _topological_sort(steps_def)

        step_map = {s.step_id: s for s in run.steps}

        for step_id in ordered_ids:
            step = step_map.get(step_id)
            if step is None:
                continue

            # Skip already-completed or skipped steps (for resumability)
            if step.status in (WorkflowStepStatus.completed, WorkflowStepStatus.skipped):
                continue

            # Check dependencies
            step_def = next((s for s in steps_def if s.get("id") == step_id), {})
            deps = step_def.get("depends_on", [])
            if deps:
                for dep_id in deps:
                    dep = step_map.get(dep_id)
                    if dep and dep.status != WorkflowStepStatus.completed:
                        step = _update_step(run, step_id, WorkflowStepStatus.waiting_dependency)
                        step_map[step_id] = step
                        continue

            # Enforce L1-only team invocation (spec §13.11)
            if step.step_type == StepType.invoke_team:
                actor_role = ctx.get("actor_role", "")
                if actor_role != "chief_of_staff":
                    step = _update_step(run, step_id, WorkflowStepStatus.failed,
                                        error="Policy: only L1 chief_of_staff may invoke teams")
                    run = _update_run_status(run, WorkflowRunStatus.failed,
                                             error="Team invocation by non-L1 agent denied")
                    step_map[step_id] = step
                    return _reload_run(run.run_id)

            # Handle human-input steps
            if step.step_type == StepType.prompt_user:
                step = _update_step(run, step_id, WorkflowStepStatus.waiting_input)
                step_map[step_id] = step
                run = _update_run_status(run, WorkflowRunStatus.waiting_input)

                if on_human_input is not None:
                    try:
                        human_response = on_human_input(step)
                        step = _update_step(run, step_id, WorkflowStepStatus.completed,
                                            outputs=human_response)
                        step_map[step_id] = step
                        ctx[f"{step_id}_output"] = human_response
                        run = _update_run_status(run, WorkflowRunStatus.running)
                        continue
                    except Exception as e:
                        step = _update_step(run, step_id, WorkflowStepStatus.failed, error=str(e))
                        run = _update_run_status(run, WorkflowRunStatus.blocked)
                        return _reload_run(run.run_id)
                else:
                    # No callback — pause here
                    return _reload_run(run.run_id)

            # Execute the step with retry logic
            step = _update_step(run, step_id, WorkflowStepStatus.running)
            step_map[step_id] = step

            timeout = step_def.get("timeout_seconds")
            max_retries = step_def.get("max_retries", 0)

            result = self._execute_step_with_retry(step, step_def, ctx, max_retries, timeout)

            if result.success:
                step = _update_step(run, step_id, WorkflowStepStatus.completed,
                                    outputs=result.outputs)
                ctx[f"{step_id}_output"] = result.outputs

                # Write artifacts/memory declared in step
                if result.artifacts:
                    _persist_artifacts(run, result.artifacts)
                if result.memory_writes:
                    _persist_memory_writes(run, result.memory_writes)
            else:
                if result.blocked:
                    step = _update_step(run, step_id, WorkflowStepStatus.blocked, error=result.error)
                    run = _update_run_status(run, WorkflowRunStatus.blocked, error=result.error)
                    step_map[step_id] = step
                    return _reload_run(run.run_id)
                else:
                    step = _update_step(run, step_id, WorkflowStepStatus.failed, error=result.error)
                    run = _update_run_status(run, WorkflowRunStatus.failed, error=result.error)
                    step_map[step_id] = step
                    return _reload_run(run.run_id)

            step_map[step_id] = step

        # All steps done
        run = _update_run_status(run, WorkflowRunStatus.completed)
        emit(
            EventType.workflow_step_completed,
            workspace_id=run.workspace_id,
            actor_type="workflow",
            actor_id=run.run_id,
            object_type="workflow_run",
            object_id=run.run_id,
            payload={"event": "completed"},
        )
        return _reload_run(run.run_id)

    def _execute_step_with_retry(
        self,
        step: WorkflowStepState,
        step_def: dict,
        ctx: dict,
        max_retries: int,
        timeout: Optional[float],
    ) -> "StepResult":
        step_ctx = StepContext(
            step_id=step.step_id,
            step_type=step.step_type,
            inputs={**step.inputs, **ctx},
            timeout=timeout,
        )

        for attempt in range(max_retries + 1):
            if attempt > 0:
                time.sleep(min(2 ** attempt, 30))  # exponential backoff, max 30s

            result = self.executor.execute(step_ctx)
            if result.success or result.blocked:
                return result

        return result  # last attempt result


def _topological_sort(steps_def: list[dict]) -> list[str]:
    """Return step IDs in execution order (topological sort for DAG)."""
    # Build adjacency
    all_ids = [s.get("id", f"step_{i}") for i, s in enumerate(steps_def)]
    deps: dict[str, list[str]] = {sid: [] for sid in all_ids}
    for s in steps_def:
        sid = s.get("id", "")
        for dep in s.get("depends_on", []):
            if dep in deps:
                deps[sid].append(dep)

    # Kahn's algorithm
    in_degree = {sid: 0 for sid in all_ids}
    for sid, dep_list in deps.items():
        for dep in dep_list:
            in_degree[sid] += 1 if dep in in_degree else 0

    queue = [sid for sid, d in in_degree.items() if d == 0]
    result = []
    while queue:
        node = queue.pop(0)
        result.append(node)
        for sid in all_ids:
            if node in deps.get(sid, []):
                in_degree[sid] -= 1
                if in_degree[sid] == 0:
                    queue.append(sid)

    # If not all nodes sorted (cycle), just return original order
    return result if len(result) == len(all_ids) else all_ids


def _persist_run(run: WorkflowRun) -> None:
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        """INSERT OR REPLACE INTO workflow_runs
           (id, workspace_id, project_id, workflow_name, workflow_version, status,
            task_id, issue_id, steps, current_step_id, handoff_refs, artifact_refs,
            error, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            run.run_id, run.workspace_id, run.project_id,
            run.workflow_name, run.workflow_version,
            run.status.value if hasattr(run.status, 'value') else str(run.status),
            run.task_id, run.issue_id,
            json.dumps([s.model_dump(mode='json') for s in run.steps]),
            run.current_step_id,
            json.dumps(run.handoff_refs),
            json.dumps(run.artifact_refs),
            run.error,
            now, now,
        ),
    )


def _update_run_status(run: WorkflowRun, status: WorkflowRunStatus, error: Optional[str] = None) -> WorkflowRun:
    now = datetime.now(timezone.utc).isoformat()
    updates = {"status": status.value, "updated_at": now}
    if error:
        updates["error"] = error
    if status == WorkflowRunStatus.completed:
        updates["completed_at"] = now
    if status == WorkflowRunStatus.running and not run.started_at:
        updates["started_at"] = now

    set_clause = ", ".join(f"{k}=?" for k in updates)
    db.execute(f"UPDATE workflow_runs SET {set_clause} WHERE id=?", (*updates.values(), run.run_id))
    return _reload_run(run.run_id)


def _update_step(run: WorkflowRun, step_id: str, status: WorkflowStepStatus,
                 outputs: dict | None = None, error: Optional[str] = None) -> WorkflowStepState:
    """Update a step's status in the run's steps JSON blob."""
    row = db.fetchone("SELECT steps FROM workflow_runs WHERE id=?", (run.run_id,))
    if not row:
        raise RuntimeError(f"Workflow run {run.run_id} not found")

    steps = json.loads(row["steps"])
    now = datetime.now(timezone.utc).isoformat()

    updated_step = None
    for s in steps:
        if s["step_id"] == step_id:
            s["status"] = status.value
            if outputs is not None:
                s["outputs"] = outputs
            if error:
                s["error"] = error
            if status == WorkflowStepStatus.running:
                s["started_at"] = now
            if status in (WorkflowStepStatus.completed, WorkflowStepStatus.failed):
                s["completed_at"] = now
            updated_step = WorkflowStepState(**s)
            break

    db.execute(
        "UPDATE workflow_runs SET steps=?, current_step_id=?, updated_at=? WHERE id=?",
        (json.dumps(steps), step_id, now, run.run_id),
    )

    emit(
        EventType.workflow_step_completed,
        workspace_id=run.workspace_id,
        actor_type="workflow",
        actor_id=run.run_id,
        object_type="workflow_step",
        object_id=step_id,
        project_id=run.project_id,
        payload={"step_id": step_id, "status": status.value},
    )

    return updated_step or WorkflowStepState(step_id=step_id, step_name=step_id, step_type=StepType.run_skill, status=status)


def _reload_run(run_id: str) -> WorkflowRun:
    row = db.fetchone("SELECT * FROM workflow_runs WHERE id=?", (run_id,))
    if not row:
        raise RuntimeError(f"Workflow run {run_id} not found")
    steps_data = json.loads(row["steps"] or "[]")
    steps = [WorkflowStepState(**s) for s in steps_data]
    return WorkflowRun(
        run_id=row["id"],
        workspace_id=row["workspace_id"],
        project_id=row["project_id"],
        workflow_name=row["workflow_name"],
        workflow_version=row["workflow_version"],
        status=WorkflowRunStatus(row["status"]),
        task_id=row["task_id"],
        issue_id=row["issue_id"],
        steps=steps,
        current_step_id=row["current_step_id"],
        handoff_refs=json.loads(row["handoff_refs"] or "[]"),
        artifact_refs=json.loads(row["artifact_refs"] or "[]"),
        error=row["error"],
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )


def _persist_artifacts(run: WorkflowRun, artifacts: list[dict]) -> None:
    """Persist artifacts produced by a step."""
    from ...ids import generate_id, ART_PREFIX
    for art in artifacts:
        art_id = art.get("artifact_id") or generate_id(ART_PREFIX)
        now = datetime.now(timezone.utc).isoformat()
        try:
            db.execute(
                """INSERT OR IGNORE INTO artifacts
                   (id, workspace_id, project_id, display_id, artifact_type, title, file_path,
                    owner_type, owner_id, status, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    art_id, run.workspace_id, run.project_id or "",
                    art.get("display_id", f"ART-{art_id[-6:]}"),
                    art.get("artifact_type", "task_outcome_summary"),
                    art.get("title", "Artifact"),
                    art.get("file_path", ""),
                    "workflow_run", run.run_id,
                    "draft", now, now,
                ),
            )
            # Link to run
            db.execute(
                "INSERT OR IGNORE INTO agentrun_artifacts (run_id, artifact_id) VALUES (?, ?)",
                (run.run_id, art_id),
            )
        except Exception:
            pass


def _persist_memory_writes(run: WorkflowRun, memory_writes: list[dict]) -> None:
    """Persist memory records produced by a step."""
    from ...ids import generate_id, MEM_PREFIX
    for mem in memory_writes:
        mem_id = mem.get("memory_id") or generate_id(MEM_PREFIX)
        now = datetime.now(timezone.utc).isoformat()
        try:
            db.execute(
                """INSERT OR IGNORE INTO memories
                   (id, scope, kind, workspace_id, project_id, title, summary, tags, entities,
                    created_at, updated_at, importance, freshness, provenance_refs)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    mem_id,
                    mem.get("scope", "project"),
                    mem.get("kind", "task_outcome"),
                    run.workspace_id, run.project_id,
                    mem.get("title", "Memory"),
                    mem.get("summary", ""),
                    json.dumps(mem.get("tags", [])),
                    json.dumps(mem.get("entities", [])),
                    now, now,
                    mem.get("importance", 0.5),
                    1.0,
                    json.dumps([]),
                ),
            )
        except Exception:
            pass
