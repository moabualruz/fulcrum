"""Step type implementations for the workflow runner. Spec §13.4."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Optional
from ...models.workflow import StepType


class HumanInputRequired(Exception):
    """Raised when a workflow step requires human input."""
    def __init__(self, step_id: str, prompt: str):
        self.step_id = step_id
        self.prompt = prompt
        super().__init__(f"Human input required for step {step_id}: {prompt}")


@dataclass
class StepContext:
    step_id: str
    step_type: StepType
    inputs: dict[str, Any]
    timeout: Optional[float] = None


@dataclass
class StepResult:
    success: bool
    outputs: dict[str, Any] = field(default_factory=dict)
    artifacts: list[dict] = field(default_factory=list)
    memory_writes: list[dict] = field(default_factory=list)
    error: Optional[str] = None
    blocked: bool = False


class StepExecutor:
    """
    Dispatches step execution by type.

    Most steps are stubs that return success with empty outputs.
    The key ones (validate_schema, gate, create_issue, create_task, write_artifact)
    have functional implementations.
    """

    def execute(self, ctx: StepContext) -> StepResult:
        # StepType is a str-enum; handle both enum instances and plain strings
        step_type_val = ctx.step_type.value if hasattr(ctx.step_type, 'value') else str(ctx.step_type)
        handler = getattr(self, f"_exec_{step_type_val}", self._exec_default)
        try:
            return handler(ctx)
        except HumanInputRequired:
            raise
        except Exception as e:
            return StepResult(success=False, error=str(e))

    def _exec_default(self, ctx: StepContext) -> StepResult:
        """Default: mark as success with no outputs."""
        return StepResult(success=True, outputs={"step_id": ctx.step_id, "status": "executed"})

    def _exec_prompt_user(self, ctx: StepContext) -> StepResult:
        """Human-input step — caller must handle this at runner level."""
        raise HumanInputRequired(ctx.step_id, ctx.inputs.get("prompt", "Input required"))

    def _exec_validate_schema(self, ctx: StepContext) -> StepResult:
        """Validate a dict against a schema (JSON Schema-style)."""
        data = ctx.inputs.get("data", {})
        required_keys = ctx.inputs.get("required_keys", [])
        missing = [k for k in required_keys if k not in data]
        if missing:
            return StepResult(success=False, error=f"Schema validation failed — missing keys: {missing}")
        return StepResult(success=True, outputs={"validated": True})

    def _exec_gate(self, ctx: StepContext) -> StepResult:
        """Gate: pass if condition is truthy, block otherwise."""
        condition = ctx.inputs.get("condition", True)
        if callable(condition):
            condition = condition()
        if condition:
            return StepResult(success=True, outputs={"gate": "passed"})
        return StepResult(success=False, blocked=True, error=ctx.inputs.get("block_reason", "Gate condition not met"))

    def _exec_create_issue(self, ctx: StepContext) -> StepResult:
        """Create an issue record."""
        try:
            from ...ids import generate_id, ISS_PREFIX
            from ...models.issue import Issue, IssueStatus
            from ...adapters.readers.issue_read import IssueWriter
            issue_id = generate_id(ISS_PREFIX)
            issue = Issue(
                issue_id=issue_id,
                workspace_id=ctx.inputs["workspace_id"],
                project_id=ctx.inputs["project_id"],
                display_id=ctx.inputs.get("display_id", f"ISS-{issue_id[-6:]}"),
                title=ctx.inputs["title"],
                description=ctx.inputs.get("description", ""),
                status=IssueStatus.backlog,
                priority=ctx.inputs.get("priority", "medium"),
            )
            IssueWriter().create(issue)
            return StepResult(success=True, outputs={"issue_id": issue_id})
        except Exception as e:
            return StepResult(success=False, error=str(e))

    def _exec_create_task(self, ctx: StepContext) -> StepResult:
        """Create a task record."""
        try:
            from ...ids import generate_id, TASK_PREFIX
            from ...models.task import Task, TaskStatus
            from ...adapters.readers.task_read import TaskWriter
            task_id = generate_id(TASK_PREFIX)
            task = Task(
                task_id=task_id,
                workspace_id=ctx.inputs["workspace_id"],
                project_id=ctx.inputs["project_id"],
                display_id=ctx.inputs.get("display_id", f"TASK-{task_id[-6:]}"),
                title=ctx.inputs["title"],
                description=ctx.inputs.get("description", ""),
                status=TaskStatus.queued,
                priority=ctx.inputs.get("priority", "medium"),
                done_criteria=ctx.inputs.get("done_criteria"),
            )
            TaskWriter().create(task)
            return StepResult(success=True, outputs={"task_id": task_id})
        except Exception as e:
            return StepResult(success=False, error=str(e))

    def _exec_write_artifact(self, ctx: StepContext) -> StepResult:
        """Write an artifact to the filesystem and register it."""
        try:
            from ...agent_home import artifact_path
            from ...ids import generate_id, ART_PREFIX
            art_id = generate_id(ART_PREFIX)
            project_id = ctx.inputs.get("project_id", "global")
            artifact_type = ctx.inputs.get("artifact_type", "task_outcome_summary")
            content = ctx.inputs.get("content", "")

            path = artifact_path(project_id, artifact_type, art_id)
            path.write_text(content)

            return StepResult(
                success=True,
                outputs={"artifact_id": art_id, "file_path": str(path)},
                artifacts=[{
                    "artifact_id": art_id,
                    "artifact_type": artifact_type,
                    "title": ctx.inputs.get("title", "Artifact"),
                    "file_path": str(path),
                    "display_id": f"ART-{art_id[-6:]}",
                }],
            )
        except Exception as e:
            return StepResult(success=False, error=str(e))

    def _exec_write_memory(self, ctx: StepContext) -> StepResult:
        return StepResult(
            success=True,
            outputs={"memory_written": True},
            memory_writes=[ctx.inputs],
        )

    def _exec_read_memory(self, ctx: StepContext) -> StepResult:
        """Stub: read memory recall (FTS only for now)."""
        return StepResult(success=True, outputs={"memories": [], "query": ctx.inputs.get("query", "")})

    def _exec_search_web(self, ctx: StepContext) -> StepResult:
        return StepResult(success=True, outputs={"results": [], "query": ctx.inputs.get("query", "")})

    def _exec_read_project(self, ctx: StepContext) -> StepResult:
        return StepResult(success=True, outputs={"files": [], "symbols": []})

    def _exec_run_skill(self, ctx: StepContext) -> StepResult:
        return StepResult(success=True, outputs={"skill": ctx.inputs.get("skill_name", "unknown")})

    def _exec_run_script(self, ctx: StepContext) -> StepResult:
        """Run a shell script (policy-checked)."""
        import subprocess
        from ...policy.engine import require
        cmd = ctx.inputs.get("command", "")
        workspace_id = ctx.inputs.get("workspace_id", "unknown")
        try:
            require("shell_exec", cmd, actor_id="workflow", workspace_id=workspace_id)
        except Exception as e:
            return StepResult(success=False, blocked=True, error=str(e))
        try:
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=ctx.timeout or 60)
            return StepResult(
                success=result.returncode == 0,
                outputs={"stdout": result.stdout, "stderr": result.stderr, "returncode": result.returncode},
                error=result.stderr if result.returncode != 0 else None,
            )
        except subprocess.TimeoutExpired:
            return StepResult(success=False, blocked=True, error="Script timeout")
        except Exception as e:
            return StepResult(success=False, error=str(e))

    def _exec_spawn_agent(self, ctx: StepContext) -> StepResult:
        return StepResult(success=True, outputs={"run_id": None, "note": "PI runtime stub"})

    def _exec_invoke_team(self, ctx: StepContext) -> StepResult:
        # L1 enforcement happens at runner level before this is called
        return StepResult(success=True, outputs={"team_instance_id": None, "note": "PI runtime stub"})

    def _exec_wait_for_task(self, ctx: StepContext) -> StepResult:
        task_id = ctx.inputs.get("task_id")
        if not task_id:
            return StepResult(success=False, error="wait_for_task requires task_id input")
        from ...db import connection as db
        row = db.fetchone("SELECT status FROM tasks WHERE id=?", (task_id,))
        if not row:
            return StepResult(success=False, error=f"Task {task_id} not found")
        if row["status"] == "completed":
            return StepResult(success=True, outputs={"task_status": "completed"})
        return StepResult(success=False, blocked=True, error=f"Task {task_id} not yet completed (status: {row['status']})")

    def _exec_review_artifact(self, ctx: StepContext) -> StepResult:
        return StepResult(success=True, outputs={"review_status": "pending", "note": "review queued"})

    def _exec_complete(self, ctx: StepContext) -> StepResult:
        return StepResult(success=True, outputs={"completed": True})
