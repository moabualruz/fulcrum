import { useEffect, useMemo, useState } from "react";

interface WorktreeStatusPayload {
  worktree: {
    worktreeId: string;
    taskId: string;
    runId?: string;
    path: string;
    branch: string;
    status: string;
    dirtyState: string;
    untrackedCount: number;
    uncommittedCount: number;
    unpushedCommitCount: number;
    conflictState: string;
    cleanupEligibility: string;
    blockReason?: string;
  };
  dirtyFiles: string[];
  untrackedFiles: string[];
  conflictedFiles: string[];
  mergeReadiness: string;
  mergeBlockReason?: string;
}

export function WorktreeDetailRoute() {
  const worktreeId = useMemo(() => {
    const [, id] = (globalThis.location?.hash ?? "").match(/^#\/worktrees\/([^/]+)/) ?? [];
    return id ?? "";
  }, []);
  const [payload, setPayload] = useState<WorktreeStatusPayload | undefined>();
  const [status, setStatus] = useState<"loading" | "ready" | "degraded">("loading");

  useEffect(() => {
    if (!worktreeId) {
      setStatus("degraded");
      return;
    }
    let active = true;
    fetch(`/api/v1/worktrees/${encodeURIComponent(worktreeId)}`)
      .then((response) => response.json())
      .then((body: { data?: WorktreeStatusPayload }) => {
        if (!active) {
          return;
        }
        setPayload(body.data);
        setStatus(body.data ? "ready" : "degraded");
      })
      .catch(() => {
        if (active) {
          setStatus("degraded");
        }
      });
    return () => {
      active = false;
    };
  }, [worktreeId]);

  return (
    <main>
      <h1>Worktree Delivery</h1>
      <p>
        {status === "degraded" ? "Worktree API degraded" : (payload?.worktree.status ?? "Loading")}
      </p>
      {payload ? (
        <section aria-label="Worktree delivery state">
          <dl>
            <dt>Branch</dt>
            <dd>{payload.worktree.branch}</dd>
            <dt>Path</dt>
            <dd>{payload.worktree.path}</dd>
            <dt>Dirty State</dt>
            <dd>{payload.worktree.dirtyState}</dd>
            <dt>Uncommitted</dt>
            <dd>{payload.worktree.uncommittedCount}</dd>
            <dt>Untracked</dt>
            <dd>{payload.worktree.untrackedCount}</dd>
            <dt>Unpushed</dt>
            <dd>{payload.worktree.unpushedCommitCount}</dd>
            <dt>Conflicts</dt>
            <dd>{payload.worktree.conflictState}</dd>
            <dt>Merge Readiness</dt>
            <dd>{payload.mergeReadiness}</dd>
            <dt>Cleanup</dt>
            <dd>{payload.worktree.cleanupEligibility}</dd>
            <dt>Block Reason</dt>
            <dd>{payload.worktree.blockReason ?? payload.mergeBlockReason ?? "None"}</dd>
          </dl>
        </section>
      ) : null}
    </main>
  );
}
