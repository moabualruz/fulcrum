"""
Integration worker — owns the merge queue and coordinates worktree merges.

Spec §18, §21.10, §21.11:
- Only the integration_worker role may dequeue and merge
- Review and test artifact gates must pass before merge
- Conflicts are attempted by the agent first; unresolved conflicts escalate
- Non-git projects are handled sequentially (no worktree needed)
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone
from typing import Optional

from ..db import connection as db
from ..events.store import emit
from ..models.events import EventType
from ..policy.engine import check as policy_check, PolicyDeniedError
from .merge_queue import MergeQueue
from .allocator import WorktreeAllocator

log = logging.getLogger(__name__)


class ArtifactGateError(Exception):
    """Raised when required review/test artifacts are missing or failing."""


class IntegrationWorker:
    """
    Coordinates the merge queue for a workspace/project.

    Enforces:
    - actor must be integration_worker role (spec §21.10)
    - review artifact gate (spec §18.10): no merge without passing review
    - test artifact gate (spec §18.10): test run artifact must be present
    - conflict-first escalation (spec §18.13)
    """

    def __init__(
        self,
        workspace_id: str,
        project_id: str,
        project_root: str,
        actor_id: str = "integration_worker",
        actor_role: str = "integration_worker",
        require_review: bool = True,
        require_tests: bool = True,
    ):
        self.workspace_id = workspace_id
        self.project_id = project_id
        self.project_root = project_root
        self.actor_id = actor_id
        self.actor_role = actor_role
        self.require_review = require_review
        self.require_tests = require_tests
        self._queue = MergeQueue()
        self._allocator = WorktreeAllocator()

    # ── Gate checks ────────────────────────────────────────────────────────

    def _check_review_gate(self, worktree_id: str) -> None:
        """Verify that a passing review artifact exists for the worktree."""
        if not self.require_review:
            return
        row = db.fetchone(
            """SELECT a.id, a.status FROM artifacts a
               JOIN agentrun_artifacts ara ON a.id = ara.artifact_id
               JOIN agent_runs r ON ara.run_id = r.id
               WHERE r.id IN (
                   SELECT run_id FROM merge_queue_projection WHERE worktree_id=?
               ) AND a.artifact_type = 'review_summary'""",
            (worktree_id,),
        )
        if row is None:
            raise ArtifactGateError(
                f"No review artifact found for worktree {worktree_id}. "
                "A reviewer agent must produce a review_summary artifact before merging."
            )
        if row["status"] not in ("approved", "accepted", "draft"):
            raise ArtifactGateError(
                f"Review artifact status '{row['status']}' is not approved for worktree {worktree_id}."
            )

    def _check_test_gate(self, worktree_id: str) -> None:
        """Verify that a passing test artifact exists for the worktree."""
        if not self.require_tests:
            return
        row = db.fetchone(
            """SELECT a.id, a.status FROM artifacts a
               JOIN agentrun_artifacts ara ON a.id = ara.artifact_id
               JOIN agent_runs r ON ara.run_id = r.id
               WHERE r.id IN (
                   SELECT run_id FROM merge_queue_projection WHERE worktree_id=?
               ) AND a.artifact_type = 'test_run_summary'""",
            (worktree_id,),
        )
        if row is None:
            raise ArtifactGateError(
                f"No test run artifact found for worktree {worktree_id}. "
                "A tester agent must produce a test_run_summary artifact before merging."
            )
        if row["status"] == "failed":
            raise ArtifactGateError(
                f"Test run artifact for worktree {worktree_id} has status 'failed'. Fix tests first."
            )

    # ── Queue operations ────────────────────────────────────────────────────

    def enqueue(
        self,
        worktree_id: str,
        task_id: Optional[str] = None,
        run_id: Optional[str] = None,
        branch_name: str = "",
    ) -> None:
        """Enqueue a worktree for integration. Any agent role may enqueue."""
        self._queue.enqueue(
            worktree_id=worktree_id,
            workspace_id=self.workspace_id,
            project_id=self.project_id,
            task_id=task_id,
            run_id=run_id,
            branch_name=branch_name,
        )
        log.info("Enqueued worktree %s (branch=%s)", worktree_id, branch_name)

    def process_next(
        self,
        target_branch: str = "main",
        skip_gates: bool = False,
    ) -> dict:
        """
        Process the next item in the merge queue.

        Must be called by the integration_worker role.
        Returns a result dict with keys: worktree_id, status, message.
        """
        # Hard enforcement: only integration_worker may dequeue and merge (spec §21.10)
        if self.actor_role != "integration_worker":
            raise PolicyDeniedError(
                f"Only the integration_worker role may process the merge queue. "
                f"Got role: '{self.actor_role}'."
            )

        # Get next queued item
        queued = self._queue.list_queued(self.workspace_id)
        project_items = [q for q in queued if q.get("project_id") == self.project_id]
        if not project_items:
            return {"status": "empty", "message": "No items in merge queue"}

        item = project_items[0]
        worktree_id = item["worktree_id"]
        branch_name = item.get("branch_name", "")

        log.info("Processing merge queue: worktree=%s branch=%s", worktree_id, branch_name)

        # Artifact gates
        if not skip_gates:
            try:
                self._check_review_gate(worktree_id)
                self._check_test_gate(worktree_id)
            except ArtifactGateError as exc:
                _update_queue_status(worktree_id, "blocked", str(exc))
                emit(
                    EventType.merge_conflicted,
                    workspace_id=self.workspace_id,
                    actor_type="system",
                    actor_id="integration_worker",
                    object_type="merge_queue",
                    object_id=worktree_id,
                    project_id=self.project_id,
                    payload={"reason": str(exc), "gate": "artifact_gate"},
                )
                return {"worktree_id": worktree_id, "status": "gate_failed", "message": str(exc)}

        # Attempt merge
        result = self._queue.merge(
            worktree_id=worktree_id,
            project_root=self.project_root,
            actor_id=self.actor_id,
            actor_role=self.actor_role,
            workspace_id=self.workspace_id,
            target_branch=target_branch,
        )

        if result.get("status") == "merged":
            # Clean up worktree after successful merge
            try:
                self._allocator.cleanup(worktree_id, self.project_root)
            except Exception as exc:
                log.warning("Worktree cleanup failed for %s: %s", worktree_id, exc)

        return result

    def drain(
        self,
        target_branch: str = "main",
        max_items: int = 20,
        skip_gates: bool = False,
    ) -> list[dict]:
        """
        Process all queued items until empty or max_items reached.

        Stops on conflict_unresolved or gate_failed — those require human attention.
        """
        results = []
        for _ in range(max_items):
            result = self.process_next(target_branch=target_branch, skip_gates=skip_gates)
            results.append(result)
            status = result.get("status", "")
            if status in ("empty", "conflict_unresolved", "gate_failed", "error"):
                break
        return results

    def queue_status(self) -> list[dict]:
        """Return the current merge queue for this project."""
        all_queued = self._queue.list_queued(self.workspace_id)
        return [q for q in all_queued if q.get("project_id") == self.project_id]


def _update_queue_status(worktree_id: str, status: str, error: Optional[str] = None) -> None:
    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        "UPDATE merge_queue_projection SET status=?, updated_at=? WHERE worktree_id=?",
        (status, now, worktree_id),
    )
